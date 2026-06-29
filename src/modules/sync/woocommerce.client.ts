import axios from 'axios';

interface WooCommerceClientConfig {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooProduct {
  id: number;
  name: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  categories: { id: number; name: string }[];
  attributes: { name: string; options: string[] }[];
  images: { src: string }[];
  permalink: string;
  date_modified: string;
}

export class WooCommerceClient {
  private baseUrl: string;
  private auth: { username: string; password: string };

  constructor(config: WooCommerceClientConfig) {
    this.baseUrl = `${config.url}/wp-json/wc/v3`;
    this.auth = { username: config.consumerKey, password: config.consumerSecret };
  }

  async getProducts(params: {
    page?: number;
    perPage?: number;
    modifiedAfter?: string;
  } = {}): Promise<WooProduct[]> {
    const response = await axios.get(`${this.baseUrl}/products`, {
      auth: this.auth,
      params: {
        page: params.page ?? 1,
        per_page: params.perPage ?? 100,
        ...(params.modifiedAfter ? { modified_after: params.modifiedAfter } : {}),
        status: 'publish',
      },
    });
    return response.data;
  }

  async getAllProducts(modifiedAfter?: string): Promise<WooProduct[]> {
    const allProducts: WooProduct[] = [];
    let page = 1;

    while (true) {
      const products = await this.getProducts({ page, perPage: 100, modifiedAfter });
      allProducts.push(...products);
      if (products.length < 100) break;
      page++;
    }

    return allProducts;
  }
}
