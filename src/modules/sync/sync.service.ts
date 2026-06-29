import type { PrismaClient } from '@prisma/client';
import type { WooCommerceClient, WooProduct } from './woocommerce.client.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { logger } from '../../common/logger.js';

interface SyncServiceDeps {
  wooClient: WooCommerceClient;
  knowledgeService: KnowledgeService;
  prisma: PrismaClient;
}

export class SyncService {
  constructor(private deps: SyncServiceDeps) {}

  formatProduct(product: WooProduct): string {
    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();
    const stockLabel = product.stock_status === 'instock' ? 'In Stock' : 'Out of Stock';
    const categories = product.categories.map((c) => c.name).join(', ');
    const attributes = product.attributes
      .map((a) => `${a.name}: ${a.options.join(', ')}`)
      .join('\n');

    let text = `Product: ${product.name}\n`;
    text += `Price: $${product.price}`;
    if (product.sale_price && product.sale_price !== product.regular_price) {
      text += ` (Regular: $${product.regular_price})`;
    }
    text += `\nAvailability: ${stockLabel}\n`;
    text += `Category: ${categories}\n`;
    if (attributes) text += `Specifications:\n${attributes}\n`;
    text += `\nDescription:\n${stripHtml(product.description || product.short_description)}\n`;
    text += `\nLink: ${product.permalink}`;

    return text;
  }

  async syncProducts(modifiedAfter?: string): Promise<{ synced: number; errors: number }> {
    logger.info({ modifiedAfter }, 'Starting WooCommerce product sync');

    const products = await this.deps.wooClient.getAllProducts(modifiedAfter);
    let synced = 0;
    let errors = 0;

    if (!modifiedAfter) {
      await this.deps.prisma.knowledgeDoc.deleteMany({
        where: { source: 'woocommerce' },
      });
    }

    for (const product of products) {
      try {
        const content = this.formatProduct(product);
        await this.deps.knowledgeService.createDoc({
          title: product.name,
          content,
          category: 'product',
          source: 'woocommerce',
          metadata: {
            wooProductId: product.id,
            price: product.price,
            stockStatus: product.stock_status,
            permalink: product.permalink,
          },
        });
        synced++;
      } catch (error) {
        logger.error({ error, productId: product.id }, 'Failed to sync product');
        errors++;
      }
    }

    logger.info({ synced, errors, total: products.length }, 'WooCommerce sync complete');
    return { synced, errors };
  }
}
