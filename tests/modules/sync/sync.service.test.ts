import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from '../../../src/modules/sync/sync.service.js';
import type { WooProduct } from '../../../src/modules/sync/woocommerce.client.js';

describe('SyncService', () => {
  let service: SyncService;
  let deps: any;

  const mockProduct: WooProduct = {
    id: 42,
    name: 'Premium Widget',
    description: '<p>A premium quality widget for all your needs.</p>',
    short_description: '<p>Premium widget</p>',
    price: '29.99',
    regular_price: '39.99',
    sale_price: '29.99',
    stock_status: 'instock',
    categories: [{ id: 1, name: 'Widgets' }],
    attributes: [{ name: 'Color', options: ['Red', 'Blue'] }],
    images: [{ src: 'https://example.com/widget.jpg' }],
    permalink: 'https://shop.example.com/product/premium-widget',
    date_modified: '2026-06-28T10:00:00',
  };

  beforeEach(() => {
    deps = {
      wooClient: { getAllProducts: vi.fn().mockResolvedValue([mockProduct]) },
      knowledgeService: { createDoc: vi.fn() },
      prisma: { knowledgeDoc: { deleteMany: vi.fn() } },
    };
    service = new SyncService(deps);
  });

  describe('formatProduct', () => {
    it('should format WooCommerce product into knowledge doc text', () => {
      const result = service.formatProduct(mockProduct);
      expect(result).toContain('Premium Widget');
      expect(result).toContain('29.99');
      expect(result).toContain('In Stock');
      expect(result).toContain('Widgets');
      expect(result).toContain('Color: Red, Blue');
    });
  });

  describe('syncProducts', () => {
    it('should fetch products and create knowledge docs', async () => {
      const result = await service.syncProducts();

      expect(deps.wooClient.getAllProducts).toHaveBeenCalled();
      expect(deps.knowledgeService.createDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Premium Widget',
          category: 'product',
          source: 'woocommerce',
          metadata: expect.objectContaining({ wooProductId: 42 }),
        })
      );
      expect(result.synced).toBe(1);
    });
  });
});
