import { CliError } from "../utils/errors.js";

export interface TokenProvider {
  getToken(): Promise<string>;
}

export interface AppStoreConnectClientOptions {
  baseUrl?: string;
  tokenProvider: TokenProvider;
  fetchImpl?: typeof fetch;
}

export interface AppSummary {
  id: string;
  name?: string;
  bundleId?: string;
  sku?: string;
  primaryLocale?: string;
}

interface AppStoreConnectResource<TAttributes = Record<string, unknown>> {
  id: string;
  type: string;
  attributes?: TAttributes;
}

interface AppListResponse {
  data: Array<
    AppStoreConnectResource<{
      name?: string;
      bundleId?: string;
      sku?: string;
      primaryLocale?: string;
    }>
  >;
}

export class AppStoreConnectClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AppStoreConnectClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.appstoreconnect.apple.com";
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listApps(): Promise<AppSummary[]> {
    const response = await this.requestJson<AppListResponse>("/v1/apps", {
      limit: "200"
    });

    return response.data.map((app) => ({
      id: app.id,
      name: app.attributes?.name,
      bundleId: app.attributes?.bundleId,
      sku: app.attributes?.sku,
      primaryLocale: app.attributes?.primaryLocale
    }));
  }

  async download(pathname: string, query: Record<string, string>): Promise<Buffer> {
    const response = await this.request(pathname, query, {
      headers: {
        Accept: "application/a-gzip, application/gzip, text/tab-separated-values, text/plain"
      }
    });

    return Buffer.from(await response.arrayBuffer());
  }

  async getJson<T>(pathname: string, query: Record<string, string> = {}): Promise<T> {
    return this.requestJson<T>(pathname, query);
  }

  async postJson<T>(pathname: string, body: unknown): Promise<T> {
    const response = await this.request(pathname, {}, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    return (await response.json()) as T;
  }

  async downloadFromUrl(url: string): Promise<Buffer> {
    const response = await this.fetchImpl(url);

    if (!response.ok) {
      throw new CliError(`Report file download failed with HTTP ${response.status}.`, {
        code: "ASC_FILE_DOWNLOAD_FAILED",
        exitCode: response.status >= 500 ? 1 : 2,
        details: {
          status: response.status,
          statusText: response.statusText,
          url,
          body: await safeResponseText(response)
        }
      });
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async requestJson<T>(pathname: string, query: Record<string, string>): Promise<T> {
    const response = await this.request(pathname, query, {
      headers: {
        Accept: "application/json"
      }
    });

    return (await response.json()) as T;
  }

  private async request(
    pathname: string,
    query: Record<string, string>,
    init: RequestInit
  ): Promise<Response> {
    const token = await this.tokenProvider.getToken();
    const url = new URL(pathname, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new CliError(`App Store Connect API request failed with HTTP ${response.status}.`, {
        code: "ASC_API_REQUEST_FAILED",
        exitCode: response.status >= 500 ? 1 : 2,
        details: {
          status: response.status,
          statusText: response.statusText,
          url: url.toString(),
          body: await safeResponseText(response)
        }
      });
    }

    return response;
  }
}

async function safeResponseText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.length > 4_000 ? `${text.slice(0, 4_000)}...` : text;
  } catch {
    return undefined;
  }
}
