import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { NormalizedSalesReportRow } from "../appstore/reports.js";

export interface SummaryOptions {
  from: string;
  to: string;
}

export interface SummaryRow {
  reportDate: string;
  appId: string;
  units: number;
  proceeds: number;
  rows: number;
}

export interface SummaryResult {
  from: string;
  to: string;
  rows: SummaryRow[];
  totals: {
    units: number;
    proceeds: number;
    rows: number;
  };
}

export class DuckDbReportStore {
  private readonly databasePath: string;
  private connection?: {
    run(sql: string): Promise<unknown>;
    runAndReadAll(sql: string): Promise<{ getRows(): unknown[] }>;
  };

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.databasePath), { recursive: true });
    const instance = await DuckDBInstance.create(this.databasePath);
    this.connection = await instance.connect();
    await this.run(`
      CREATE TABLE IF NOT EXISTS sales_report_rows (
        report_date DATE NOT NULL,
        app_id VARCHAR NOT NULL,
        units DOUBLE NOT NULL,
        proceeds DOUBLE NOT NULL,
        country_code VARCHAR,
        product_type_identifier VARCHAR,
        row_json VARCHAR NOT NULL,
        imported_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      )
    `);
  }

  async saveSalesRows(rows: NormalizedSalesReportRow[]): Promise<void> {
    await this.init();

    if (rows.length === 0) {
      return;
    }

    await this.run("BEGIN TRANSACTION");
    try {
      for (const chunk of chunkRows(rows, 500)) {
        await this.run(`
          INSERT INTO sales_report_rows (
            report_date,
            app_id,
            units,
            proceeds,
            country_code,
            product_type_identifier,
            row_json
          )
          VALUES ${chunk.map(rowToSqlValues).join(",\n")}
        `);
      }
      await this.run("COMMIT");
    } catch (error) {
      await this.run("ROLLBACK");
      throw error;
    }
  }

  async summarize(options: SummaryOptions): Promise<SummaryResult> {
    await this.init();
    const result = await this.read(`
      SELECT
        CAST(report_date AS VARCHAR) AS report_date,
        app_id,
        SUM(units) AS units,
        SUM(proceeds) AS proceeds,
        COUNT(*) AS rows
      FROM sales_report_rows
      WHERE report_date BETWEEN DATE ${sqlString(options.from)} AND DATE ${sqlString(options.to)}
      GROUP BY report_date, app_id
      ORDER BY report_date, app_id
    `);

    const rows = result.map(toSummaryRow);
    const totals = rows.reduce(
      (accumulator, row) => ({
        units: accumulator.units + row.units,
        proceeds: accumulator.proceeds + row.proceeds,
        rows: accumulator.rows + row.rows
      }),
      { units: 0, proceeds: 0, rows: 0 }
    );

    return {
      from: options.from,
      to: options.to,
      rows,
      totals
    };
  }

  private async run(sql: string): Promise<void> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized.");
    }
    await this.connection.run(sql);
  }

  private async read(sql: string): Promise<unknown[]> {
    if (!this.connection) {
      throw new Error("DuckDB connection is not initialized.");
    }
    const reader = await this.connection.runAndReadAll(sql);
    return reader.getRows();
  }
}

function rowToSqlValues(row: NormalizedSalesReportRow): string {
  return `(${[
    `DATE ${sqlString(row.reportDate)}`,
    sqlString(row.appId),
    sqlNumber(row.units),
    sqlNumber(row.proceeds),
    sqlNullableString(row.countryCode),
    sqlNullableString(row.productTypeIdentifier),
    sqlString(JSON.stringify(row.row))
  ].join(", ")})`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableString(value: string | undefined): string {
  return value === undefined || value === "" ? "NULL" : sqlString(value);
}

function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function toSummaryRow(row: unknown): SummaryRow {
  if (Array.isArray(row)) {
    return {
      reportDate: String(row[0]),
      appId: String(row[1]),
      units: Number(row[2] ?? 0),
      proceeds: Number(row[3] ?? 0),
      rows: Number(row[4] ?? 0)
    };
  }

  const record = row as Record<string, unknown>;
  return {
    reportDate: String(record.report_date),
    appId: String(record.app_id),
    units: Number(record.units ?? 0),
    proceeds: Number(record.proceeds ?? 0),
    rows: Number(record.rows ?? 0)
  };
}
