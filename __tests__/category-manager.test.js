'use strict';

const { describe, test, expect, beforeEach } = require('@jest/globals');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');

// Load ValidationHelpers module first (dependency)
const validationHelpersCode = fs.readFileSync(path.join(__dirname, '../src/utils/validation-helpers.js'), 'utf8');
eval(validationHelpersCode);

// Load module
const categoryManagerCode = fs.readFileSync(path.join(__dirname, '../src/managers/category-manager.js'), 'utf8');

// Mock chrome.storage.sync
global.chrome = {
  storage: {
    sync: {
      get: null,
      set: null
    }
  },
  runtime: {
    lastError: null
  }
};

describe('CategoryManager', () => {
  beforeEach(() => {
    // Reset chrome.runtime.lastError
    chrome.runtime.lastError = null;
    
    // Re-evaluate module to reset cache
    eval(categoryManagerCode);
  });

  describe('getCategories', () => {
    test('should return empty array when no categories exist', async () => {
      // Mock chrome.storage.sync.get to return empty result
      chrome.storage.sync.get = (keys, callback) => {
        callback({});
      };

      const categories = await CategoryManager.getCategories();
      expect(categories).toEqual([]);
    });

    test('should return categories from storage', async () => {
      const mockCategories = [
        { id: 'work', name: '工作', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting'] },
        { id: 'shopping', name: '購物', emoji: '🛍', color: '#ff6d00', bgColor: '#fff3e0', keywords: ['order'] }
      ];

      // Mock chrome.storage.sync.get to return categories
      chrome.storage.sync.get = (keys, callback) => {
        callback({ categories: mockCategories });
      };

      const categories = await CategoryManager.getCategories();
      expect(categories).toEqual(mockCategories);
      expect(categories.length).toBe(2);
      expect(categories[0].id).toBe('work');
      expect(categories[1].id).toBe('shopping');
    });

    test('should cache categories after first load', async () => {
      const mockCategories = [
        { id: 'work', name: '工作', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] }
      ];

      let callCount = 0;
      chrome.storage.sync.get = (keys, callback) => {
        callCount++;
        callback({ categories: mockCategories });
      };

      // First call should read from storage
      const categories1 = await CategoryManager.getCategories();
      expect(callCount).toBe(1);
      expect(categories1).toEqual(mockCategories);

      // Second call should use cache
      const categories2 = await CategoryManager.getCategories();
      expect(callCount).toBe(1); // Should not increment
      expect(categories2).toEqual(mockCategories);
    });

    test('should handle storage errors gracefully', async () => {
      // Mock chrome.storage.sync.get to simulate error
      chrome.storage.sync.get = (keys, callback) => {
        chrome.runtime.lastError = { message: 'Storage error' };
        callback({});
      };

      await expect(CategoryManager.getCategories()).rejects.toEqual({ message: 'Storage error' });
    });
  });

  describe('getDefaultColors', () => {
    test('should return default color pair', () => {
      eval(categoryManagerCode);
      const colors = CategoryManager.getDefaultColors();
      expect(colors).toEqual({
        color: '#4285f4',
        bgColor: '#e8f0fe'
      });
    });
  });

  describe('CRUD methods', () => {
    beforeEach(() => {
      eval(categoryManagerCode);
    });

    test('createCategory should validate input and reject invalid data', async () => {
      await expect(CategoryManager.createCategory({})).rejects.toThrow('Name is required');
    });

    test('createCategory should create valid category and persist to storage', async () => {
      const validData = {
        name: 'Travel',
        emoji: '✈️',
        color: '#1976d2',
        bgColor: '#e3f2fd',
        keywords: ['flight', 'hotel']
      };

      // Mock storage to return empty categories initially
      chrome.storage.sync.get = (keys, callback) => {
        callback({ categories: [] });
      };

      // Mock storage set
      let savedCategories = null;
      chrome.storage.sync.set = (data, callback) => {
        savedCategories = data.categories;
        callback();
      };

      const result = await CategoryManager.createCategory(validData);

      // Verify category was created with correct properties
      expect(result.id).toMatch(/^custom-\d+-\d+\d+$/);
      expect(result.name).toBe('Travel');
      expect(result.emoji).toBe('✈️');
      expect(result.color).toBe('#1976d2');
      expect(result.bgColor).toBe('#e3f2fd');
      expect(result.keywords).toEqual(['flight', 'hotel']);
      expect(result.isCustom).toBe(true);
      expect(result.createdAt).toBeGreaterThan(0);

      // Verify it was saved to storage
      expect(savedCategories).toHaveLength(1);
      expect(savedCategories[0]).toEqual(result);
    });

    test('createCategory should reject duplicate names (case-insensitive)', async () => {
      const existingCategories = [
        { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] }
      ];

      chrome.storage.sync.get = (keys, callback) => {
        callback({ categories: existingCategories });
      };

      const duplicateData = {
        name: 'work', // Same name, different case
        emoji: '✈️',
        color: '#1976d2',
        bgColor: '#e3f2fd',
        keywords: []
      };

      await expect(CategoryManager.createCategory(duplicateData)).rejects.toThrow("Category name 'work' already exists");
    });

    test('createCategory should trim category name', async () => {
      const validData = {
        name: '  Travel  ',
        emoji: '✈️',
        color: '#1976d2',
        bgColor: '#e3f2fd',
        keywords: []
      };

      chrome.storage.sync.get = (keys, callback) => {
        callback({ categories: [] });
      };

      chrome.storage.sync.set = (data, callback) => {
        callback();
      };

      const result = await CategoryManager.createCategory(validData);
      expect(result.name).toBe('Travel'); // Trimmed
    });

    test('createCategory should handle storage errors', async () => {
      const validData = {
        name: 'Travel',
        emoji: '✈️',
        color: '#1976d2',
        bgColor: '#e3f2fd',
        keywords: []
      };

      chrome.storage.sync.get = (keys, callback) => {
        callback({ categories: [] });
      };

      chrome.storage.sync.set = (data, callback) => {
        chrome.runtime.lastError = { message: 'Storage quota exceeded' };
        callback();
      };

      await expect(CategoryManager.createCategory(validData)).rejects.toEqual({ message: 'Storage quota exceeded' });
    });

    describe('Property 1: Category ID Uniqueness', () => {
      test('**Validates: Requirements 8.1, 8.4** - all created categories have unique IDs', async () => {
        // Generator for valid category data
        const validCategoryArb = fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          emoji: fc.constantFrom('💼', '✈️', '📧', '🛍', '🎉', '🏠', '🚗', '🍕', '📱', '⚽'),
          color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00', '#00897b', '#c62828', '#7b1fa2'),
          bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0', '#e0f2f1', '#ffebee', '#f3e5f5'),
          keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 })
        });

        await fc.assert(
          fc.asyncProperty(
            fc.array(validCategoryArb, { minLength: 2, maxLength: 10 }),
            async (categoryDataArray) => {
              // Reset module to clear cache
              eval(categoryManagerCode);

              // Track all created categories
              const createdCategories = [];
              let storageCategories = [];

              // Mock storage to track categories
              chrome.storage.sync.get = (keys, callback) => {
                callback({ categories: storageCategories });
              };

              chrome.storage.sync.set = (data, callback) => {
                storageCategories = data.categories;
                callback();
              };

              // Create all categories sequentially with unique names
              for (let i = 0; i < categoryDataArray.length; i++) {
                const categoryData = categoryDataArray[i];
                // Make names unique by appending index
                const uniqueData = {
                  ...categoryData,
                  name: `${categoryData.name.trim()}_${i}`
                };

                try {
                  const created = await CategoryManager.createCategory(uniqueData);
                  createdCategories.push(created);
                } catch (error) {
                  // Skip if validation fails (e.g., invalid emoji from generator)
                  continue;
                }
              }

              // Property: All IDs must be unique
              if (createdCategories.length > 1) {
                const ids = createdCategories.map(cat => cat.id);
                const uniqueIds = new Set(ids);
                return ids.length === uniqueIds.size;
              }

              return true;
            }
          ),
          { numRuns: 50 }
        );
      });

      test('**Validates: Requirements 8.1, 8.4** - IDs are unique even when created rapidly', async () => {
        eval(categoryManagerCode);

        let storageCategories = [];
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // Create multiple categories rapidly
        const createdCategories = [];
        for (let i = 0; i < 20; i++) {
          const category = await CategoryManager.createCategory({
            name: `Category${i}`,
            emoji: '💼',
            color: '#4285f4',
            bgColor: '#e8f0fe',
            keywords: []
          });
          createdCategories.push(category);
        }

        // Verify all IDs are unique
        const ids = createdCategories.map(cat => cat.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
        expect(uniqueIds.size).toBe(20);
      });

      test('**Validates: Requirements 8.1, 8.4** - ID format is consistent and unique', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 5, max: 15 }),
            async (count) => {
              eval(categoryManagerCode);

              let storageCategories = [];
              chrome.storage.sync.get = (keys, callback) => {
                callback({ categories: storageCategories });
              };

              chrome.storage.sync.set = (data, callback) => {
                storageCategories = data.categories;
                callback();
              };

              const createdCategories = [];
              for (let i = 0; i < count; i++) {
                const category = await CategoryManager.createCategory({
                  name: `Test${i}`,
                  emoji: '💼',
                  color: '#4285f4',
                  bgColor: '#e8f0fe',
                  keywords: []
                });
                createdCategories.push(category);
              }

              // All IDs should match the expected format
              const allMatchFormat = createdCategories.every(cat => 
                /^custom-\d+-\d+\d+$/.test(cat.id)
              );

              // All IDs should be unique
              const ids = createdCategories.map(cat => cat.id);
              const uniqueIds = new Set(ids);
              const allUnique = ids.length === uniqueIds.size;

              return allMatchFormat && allUnique;
            }
          ),
          { numRuns: 30 }
        );
      });
    });

    describe('Property 2: Category Name Uniqueness (Case-Insensitive)', () => {
      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - duplicate names are rejected (case-insensitive)', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.constantFrom('lower', 'UPPER', 'MiXeD', 'Title'),
            async (baseName, caseVariant) => {
              eval(categoryManagerCode);

              let storageCategories = [];
              chrome.storage.sync.get = (keys, callback) => {
                callback({ categories: storageCategories });
              };

              chrome.storage.sync.set = (data, callback) => {
                storageCategories = data.categories;
                callback();
              };

              // Create first category with base name
              const firstName = baseName.trim();
              await CategoryManager.createCategory({
                name: firstName,
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe',
                keywords: []
              });

              // Try to create second category with different case
              let secondName;
              switch (caseVariant) {
                case 'lower':
                  secondName = firstName.toLowerCase();
                  break;
                case 'UPPER':
                  secondName = firstName.toUpperCase();
                  break;
                case 'MiXeD':
                  secondName = firstName.split('').map((c, i) => 
                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
                  ).join('');
                  break;
                case 'Title':
                  secondName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                  break;
              }

              // If names are different case-insensitively, should reject
              if (firstName.toLowerCase() === secondName.toLowerCase()) {
                try {
                  await CategoryManager.createCategory({
                    name: secondName,
                    emoji: '✈️',
                    color: '#1976d2',
                    bgColor: '#e3f2fd',
                    keywords: []
                  });
                  // Should not reach here - should have thrown error
                  return false;
                } catch (error) {
                  // Should throw error about duplicate name
                  return error.message.includes('already exists');
                }
              }

              return true;
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - exact duplicate names are rejected', async () => {
        eval(categoryManagerCode);

        let storageCategories = [];
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // Create first category
        await CategoryManager.createCategory({
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        });

        // Try to create duplicate
        await expect(CategoryManager.createCategory({
          name: 'Work',
          emoji: '✈️',
          color: '#1976d2',
          bgColor: '#e3f2fd',
          keywords: []
        })).rejects.toThrow("Category name 'Work' already exists");
      });

      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - case variations are rejected', async () => {
        eval(categoryManagerCode);

        let storageCategories = [];
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // Create first category
        await CategoryManager.createCategory({
          name: 'Travel',
          emoji: '✈️',
          color: '#1976d2',
          bgColor: '#e3f2fd',
          keywords: []
        });

        // Try various case variations
        const caseVariations = ['travel', 'TRAVEL', 'TrAvEl', 'TRAVEL', 'tRaVeL'];
        
        for (const variation of caseVariations) {
          await expect(CategoryManager.createCategory({
            name: variation,
            emoji: '🛍',
            color: '#ff6d00',
            bgColor: '#fff3e0',
            keywords: []
          })).rejects.toThrow('already exists');
        }
      });

      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - whitespace-trimmed duplicates are rejected', async () => {
        eval(categoryManagerCode);

        let storageCategories = [];
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // Create first category
        await CategoryManager.createCategory({
          name: 'Shopping',
          emoji: '🛍',
          color: '#ff6d00',
          bgColor: '#fff3e0',
          keywords: []
        });

        // Try with whitespace variations
        await expect(CategoryManager.createCategory({
          name: '  Shopping  ',
          emoji: '📧',
          color: '#00897b',
          bgColor: '#e0f2f1',
          keywords: []
        })).rejects.toThrow('already exists');

        await expect(CategoryManager.createCategory({
          name: 'shopping',
          emoji: '📧',
          color: '#00897b',
          bgColor: '#e0f2f1',
          keywords: []
        })).rejects.toThrow('already exists');
      });

      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - multiple categories maintain name uniqueness', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              { minLength: 3, maxLength: 10 }
            ),
            async (names) => {
              eval(categoryManagerCode);

              let storageCategories = [];
              chrome.storage.sync.get = (keys, callback) => {
                callback({ categories: storageCategories });
              };

              chrome.storage.sync.set = (data, callback) => {
                storageCategories = data.categories;
                callback();
              };

              const createdCategories = [];
              const seenNames = new Set();

              for (const name of names) {
                const trimmedLower = name.trim().toLowerCase();
                
                // Skip if we've already seen this name (case-insensitive)
                if (seenNames.has(trimmedLower)) {
                  // Should reject duplicate
                  try {
                    await CategoryManager.createCategory({
                      name: name,
                      emoji: '💼',
                      color: '#4285f4',
                      bgColor: '#e8f0fe',
                      keywords: []
                    });
                    // Should not reach here
                    return false;
                  } catch (error) {
                    // Expected to throw
                    if (!error.message.includes('already exists')) {
                      return false;
                    }
                  }
                } else {
                  // Should succeed
                  try {
                    const created = await CategoryManager.createCategory({
                      name: name,
                      emoji: '💼',
                      color: '#4285f4',
                      bgColor: '#e8f0fe',
                      keywords: []
                    });
                    createdCategories.push(created);
                    seenNames.add(trimmedLower);
                  } catch (error) {
                    // Unexpected error
                    return false;
                  }
                }
              }

              // Verify all created categories have unique names (case-insensitive)
              const categoryNames = createdCategories.map(cat => cat.name.toLowerCase());
              const uniqueNames = new Set(categoryNames);
              return categoryNames.length === uniqueNames.size;
            }
          ),
          { numRuns: 50 }
        );
      });

      test('**Validates: Requirements 1.5, 2.4, 8.2, 8.3, 8.5** - error message includes the duplicate name', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            async (name) => {
              eval(categoryManagerCode);

              let storageCategories = [];
              chrome.storage.sync.get = (keys, callback) => {
                callback({ categories: storageCategories });
              };

              chrome.storage.sync.set = (data, callback) => {
                storageCategories = data.categories;
                callback();
              };

              // Create first category
              await CategoryManager.createCategory({
                name: name,
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe',
                keywords: []
              });

              // Try to create duplicate
              try {
                await CategoryManager.createCategory({
                  name: name,
                  emoji: '✈️',
                  color: '#1976d2',
                  bgColor: '#e3f2fd',
                  keywords: []
                });
                return false; // Should have thrown
              } catch (error) {
                // Error message should mention the name and "already exists"
                const trimmedName = name.trim().toLowerCase();
                const errorLower = error.message.toLowerCase();
                return errorLower.includes('already exists') && 
                       errorLower.includes(trimmedName);
              }
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('updateCategory', () => {
      test('should update category name only', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: ['meeting', 'project'],
          isCustom: true,
          createdAt: 1234567890
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        let savedCategories = null;
        chrome.storage.sync.set = (data, callback) => {
          savedCategories = data.categories;
          callback();
        };

        const updates = { name: 'Work Updated' };
        const result = await CategoryManager.updateCategory('work', updates);

        expect(result.name).toBe('Work Updated');
        expect(result.emoji).toBe('💼'); // Unchanged
        expect(result.color).toBe('#4285f4'); // Unchanged
        expect(result.bgColor).toBe('#e8f0fe'); // Unchanged
        expect(result.keywords).toEqual(['meeting', 'project']); // Unchanged
        expect(result.isCustom).toBe(true); // Unchanged
        expect(result.createdAt).toBe(1234567890); // Unchanged

        expect(savedCategories).toHaveLength(1);
        expect(savedCategories[0]).toEqual(result);
      });

      test('should update multiple fields at once', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: ['meeting'],
          isCustom: true
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        chrome.storage.sync.set = (data, callback) => {
          callback();
        };

        const updates = {
          name: 'Business',
          emoji: '📊',
          color: '#ff0000',
          bgColor: '#ffeeee'
        };

        const result = await CategoryManager.updateCategory('work', updates);

        expect(result.name).toBe('Business');
        expect(result.emoji).toBe('📊');
        expect(result.color).toBe('#ff0000');
        expect(result.bgColor).toBe('#ffeeee');
        expect(result.keywords).toEqual(['meeting']); // Unchanged
      });

      test('should update keywords array', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: ['meeting'],
          isCustom: true
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        chrome.storage.sync.set = (data, callback) => {
          callback();
        };

        const updates = { keywords: ['meeting', 'project', 'deadline'] };
        const result = await CategoryManager.updateCategory('work', updates);

        expect(result.keywords).toEqual(['meeting', 'project', 'deadline']);
        expect(result.name).toBe('Work'); // Unchanged
      });

      test('should reject update if category not found', async () => {
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [] });
        };

        await expect(
          CategoryManager.updateCategory('nonexistent', { name: 'Test' })
        ).rejects.toThrow("Category with ID 'nonexistent' not found");
      });

      test('should reject duplicate name when updating', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] },
          { id: 'travel', name: 'Travel', emoji: '✈️', color: '#1976d2', bgColor: '#e3f2fd', keywords: [] }
        ];

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: existingCategories });
        };

        await expect(
          CategoryManager.updateCategory('work', { name: 'Travel' })
        ).rejects.toThrow("Category name 'Travel' already exists");
      });

      test('should reject duplicate name (case-insensitive) when updating', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] },
          { id: 'travel', name: 'Travel', emoji: '✈️', color: '#1976d2', bgColor: '#e3f2fd', keywords: [] }
        ];

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: existingCategories });
        };

        await expect(
          CategoryManager.updateCategory('work', { name: 'TRAVEL' })
        ).rejects.toThrow("Category name 'TRAVEL' already exists");
      });

      test('should allow updating to same name (case-insensitive)', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        chrome.storage.sync.set = (data, callback) => {
          callback();
        };

        // Should allow updating to same name with different case
        const result = await CategoryManager.updateCategory('work', { name: 'WORK' });
        expect(result.name).toBe('WORK');
      });

      test('should validate updated fields', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        // Invalid color format
        await expect(
          CategoryManager.updateCategory('work', { color: 'blue' })
        ).rejects.toThrow('Invalid text color');

        // Invalid emoji
        await expect(
          CategoryManager.updateCategory('work', { emoji: 'NOT VALID!' })
        ).rejects.toThrow('Invalid icon or emoji format');

        // Name too long
        await expect(
          CategoryManager.updateCategory('work', { name: 'a'.repeat(21) })
        ).rejects.toThrow('Name must be 20 characters or less');
      });

      test('should trim name when updating', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        chrome.storage.sync.set = (data, callback) => {
          callback();
        };

        const result = await CategoryManager.updateCategory('work', { name: '  Business  ' });
        expect(result.name).toBe('Business');
      });

      test('should handle storage errors', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        };

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [existingCategory] });
        };

        chrome.storage.sync.set = (data, callback) => {
          chrome.runtime.lastError = { message: 'Storage quota exceeded' };
          callback();
        };

        await expect(
          CategoryManager.updateCategory('work', { name: 'Updated' })
        ).rejects.toEqual({ message: 'Storage quota exceeded' });
      });

      test('should invalidate cache after update', async () => {
        const existingCategory = {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: []
        };

        let storageCategories = [existingCategory];
        let getCalls = 0;

        chrome.storage.sync.get = (keys, callback) => {
          getCalls++;
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // First call to cache
        await CategoryManager.getCategories();
        expect(getCalls).toBe(1);

        // Update should invalidate cache
        await CategoryManager.updateCategory('work', { name: 'Updated' });

        // Next call should read from storage again
        const categories = await CategoryManager.getCategories();
        expect(getCalls).toBe(2);
        expect(categories[0].name).toBe('Updated');
      });

      describe('Property 7: Partial Update Preservation', () => {
        test('**Validates: Requirements 2.2** - updating only name preserves all other fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧', '🛍', '🎉', '🏠'),
                color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00', '#00897b', '#c62828'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0', '#e0f2f1', '#ffebee'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
              }),
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              async (originalData, newName) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only name field
                const updated = await CategoryManager.updateCategory(created.id, { name: newName });

                // Assert name changed
                expect(updated.name).toBe(newName.trim());

                // Assert all other fields unchanged
                expect(updated.emoji).toBe(created.emoji);
                expect(updated.color).toBe(created.color);
                expect(updated.bgColor).toBe(created.bgColor);
                expect(updated.keywords).toEqual(created.keywords);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - updating only emoji preserves all other fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧'),
                color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
              }),
              fc.constantFrom('🛍', '🎉', '🏠', '🚗', '🍕'),
              async (originalData, newEmoji) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only emoji field
                const updated = await CategoryManager.updateCategory(created.id, { emoji: newEmoji });

                // Assert emoji changed
                expect(updated.emoji).toBe(newEmoji);

                // Assert all other fields unchanged
                expect(updated.name).toBe(created.name);
                expect(updated.color).toBe(created.color);
                expect(updated.bgColor).toBe(created.bgColor);
                expect(updated.keywords).toEqual(created.keywords);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - updating only color preserves all other fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧'),
                color: fc.constantFrom('#4285f4', '#1976d2'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
              }),
              fc.constantFrom('#ff6d00', '#00897b', '#c62828', '#7b1fa2'),
              async (originalData, newColor) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only color field
                const updated = await CategoryManager.updateCategory(created.id, { color: newColor });

                // Assert color changed
                expect(updated.color).toBe(newColor);

                // Assert all other fields unchanged
                expect(updated.name).toBe(created.name);
                expect(updated.emoji).toBe(created.emoji);
                expect(updated.bgColor).toBe(created.bgColor);
                expect(updated.keywords).toEqual(created.keywords);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - updating only bgColor preserves all other fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧'),
                color: fc.constantFrom('#4285f4', '#1976d2'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
              }),
              fc.constantFrom('#fff3e0', '#e0f2f1', '#ffebee', '#f3e5f5'),
              async (originalData, newBgColor) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only bgColor field
                const updated = await CategoryManager.updateCategory(created.id, { bgColor: newBgColor });

                // Assert bgColor changed
                expect(updated.bgColor).toBe(newBgColor);

                // Assert all other fields unchanged
                expect(updated.name).toBe(created.name);
                expect(updated.emoji).toBe(created.emoji);
                expect(updated.color).toBe(created.color);
                expect(updated.keywords).toEqual(created.keywords);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - updating only keywords preserves all other fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧'),
                color: fc.constantFrom('#4285f4', '#1976d2'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 3 })
              }),
              fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
              async (originalData, newKeywords) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only keywords field
                const updated = await CategoryManager.updateCategory(created.id, { keywords: newKeywords });

                // Assert keywords changed
                expect(updated.keywords).toEqual(newKeywords);

                // Assert all other fields unchanged
                expect(updated.name).toBe(created.name);
                expect(updated.emoji).toBe(created.emoji);
                expect(updated.color).toBe(created.color);
                expect(updated.bgColor).toBe(created.bgColor);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - updating multiple fields preserves unchanged fields', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧'),
                color: fc.constantFrom('#4285f4', '#1976d2'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 3 })
              }),
              fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              fc.constantFrom('🛍', '🎉', '🏠'),
              async (originalData, newName, newEmoji) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with all fields
                const created = await CategoryManager.createCategory(originalData);

                // Update only name and emoji fields
                const updated = await CategoryManager.updateCategory(created.id, { 
                  name: newName, 
                  emoji: newEmoji 
                });

                // Assert updated fields changed
                expect(updated.name).toBe(newName.trim());
                expect(updated.emoji).toBe(newEmoji);

                // Assert unchanged fields preserved
                expect(updated.color).toBe(created.color);
                expect(updated.bgColor).toBe(created.bgColor);
                expect(updated.keywords).toEqual(created.keywords);
                expect(updated.id).toBe(created.id);
                expect(updated.isCustom).toBe(created.isCustom);
                expect(updated.createdAt).toBe(created.createdAt);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 2.2** - empty keywords update replaces existing keywords', async () => {
          eval(categoryManagerCode);

          let storageCategories = [];
          chrome.storage.sync.get = (keys, callback) => {
            callback({ categories: storageCategories });
          };

          chrome.storage.sync.set = (data, callback) => {
            storageCategories = data.categories;
            callback();
          };

          // Create category with keywords
          const created = await CategoryManager.createCategory({
            name: 'Work',
            emoji: '💼',
            color: '#4285f4',
            bgColor: '#e8f0fe',
            keywords: ['meeting', 'project', 'deadline']
          });

          // Update with empty keywords array
          const updated = await CategoryManager.updateCategory(created.id, { keywords: [] });

          // Assert keywords replaced with empty array
          expect(updated.keywords).toEqual([]);

          // Assert other fields unchanged
          expect(updated.name).toBe(created.name);
          expect(updated.emoji).toBe(created.emoji);
          expect(updated.color).toBe(created.color);
          expect(updated.bgColor).toBe(created.bgColor);
        });

        test('**Validates: Requirements 2.2** - partial update with no changes preserves all fields', async () => {
          eval(categoryManagerCode);

          let storageCategories = [];
          chrome.storage.sync.get = (keys, callback) => {
            callback({ categories: storageCategories });
          };

          chrome.storage.sync.set = (data, callback) => {
            storageCategories = data.categories;
            callback();
          };

          // Create category
          const created = await CategoryManager.createCategory({
            name: 'Travel',
            emoji: '✈️',
            color: '#1976d2',
            bgColor: '#e3f2fd',
            keywords: ['flight', 'hotel']
          });

          // Update with same name (should still work)
          const updated = await CategoryManager.updateCategory(created.id, { name: 'Travel' });

          // Assert all fields unchanged
          expect(updated.name).toBe(created.name);
          expect(updated.emoji).toBe(created.emoji);
          expect(updated.color).toBe(created.color);
          expect(updated.bgColor).toBe(created.bgColor);
          expect(updated.keywords).toEqual(created.keywords);
          expect(updated.id).toBe(created.id);
          expect(updated.isCustom).toBe(created.isCustom);
          expect(updated.createdAt).toBe(created.createdAt);
        });
      });
    });

    describe('deleteCategory', () => {
      test('should delete existing category', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting'] },
          { id: 'travel', name: 'Travel', emoji: '✈️', color: '#1976d2', bgColor: '#e3f2fd', keywords: ['flight'] }
        ];

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: existingCategories });
        };

        let savedCategories = null;
        chrome.storage.sync.set = (data, callback) => {
          savedCategories = data.categories;
          callback();
        };

        const result = await CategoryManager.deleteCategory('work');

        expect(result).toBe(true);
        expect(savedCategories).toHaveLength(1);
        expect(savedCategories[0].id).toBe('travel');
      });

      test('should return false if category not found', async () => {
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: [] });
        };

        const result = await CategoryManager.deleteCategory('nonexistent');
        expect(result).toBe(false);
      });

      test('should remove category and all its keywords', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: ['meeting', 'project', 'deadline'] }
        ];

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: existingCategories });
        };

        let savedCategories = null;
        chrome.storage.sync.set = (data, callback) => {
          savedCategories = data.categories;
          callback();
        };

        const result = await CategoryManager.deleteCategory('work');

        expect(result).toBe(true);
        expect(savedCategories).toEqual([]);
      });

      test('should handle storage errors', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] }
        ];

        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: existingCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          chrome.runtime.lastError = { message: 'Storage error' };
          callback();
        };

        await expect(CategoryManager.deleteCategory('work')).rejects.toEqual({ message: 'Storage error' });
      });

      test('should invalidate cache after deletion', async () => {
        const existingCategories = [
          { id: 'work', name: 'Work', emoji: '💼', color: '#4285f4', bgColor: '#e8f0fe', keywords: [] },
          { id: 'travel', name: 'Travel', emoji: '✈️', color: '#1976d2', bgColor: '#e3f2fd', keywords: [] }
        ];

        let storageCategories = existingCategories;
        chrome.storage.sync.get = (keys, callback) => {
          callback({ categories: storageCategories });
        };

        chrome.storage.sync.set = (data, callback) => {
          storageCategories = data.categories;
          callback();
        };

        // First call to populate cache
        await CategoryManager.getCategories();

        // Delete category
        await CategoryManager.deleteCategory('work');

        // Get categories again - should reflect deletion
        const categories = await CategoryManager.getCategories();
        expect(categories).toHaveLength(1);
        expect(categories[0].id).toBe('travel');
      });

      describe('Property 10: Deletion Removes All Data', () => {
        test('**Validates: Requirements 3.2, 10.4** - deleted category and all keywords are completely removed from storage', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                emoji: fc.constantFrom('💼', '✈️', '📧', '🛍', '🎉', '🏠', '🚗', '🍕'),
                color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00', '#00897b', '#c62828', '#7b1fa2'),
                bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0', '#e0f2f1', '#ffebee', '#f3e5f5'),
                keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 10 })
              }),
              async (categoryData) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create category with keywords
                const created = await CategoryManager.createCategory(categoryData);
                
                // Verify category was created with keywords
                expect(created.keywords).toEqual(categoryData.keywords);
                expect(storageCategories).toHaveLength(1);
                expect(storageCategories[0].id).toBe(created.id);
                expect(storageCategories[0].keywords).toEqual(categoryData.keywords);

                // Delete the category
                const deleteResult = await CategoryManager.deleteCategory(created.id);
                
                // Assert deletion was successful
                expect(deleteResult).toBe(true);

                // Assert category is completely removed from storage
                expect(storageCategories).toHaveLength(0);
                expect(storageCategories).toEqual([]);

                // Assert no category with that ID exists
                const foundCategory = storageCategories.find(cat => cat.id === created.id);
                expect(foundCategory).toBeUndefined();

                // Assert keywords are gone (no orphaned data)
                const allKeywords = storageCategories.flatMap(cat => cat.keywords || []);
                categoryData.keywords.forEach(keyword => {
                  expect(allKeywords).not.toContain(keyword);
                });

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 3.2, 10.4** - deleting one category does not affect other categories', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.array(
                fc.record({
                  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                  emoji: fc.constantFrom('💼', '✈️', '📧', '🛍', '🎉', '🏠'),
                  color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00', '#00897b'),
                  bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0', '#e0f2f1'),
                  keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
                }),
                { minLength: 2, maxLength: 5 }
              ),
              async (categoryDataArray) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create multiple categories with unique names
                const createdCategories = [];
                for (let i = 0; i < categoryDataArray.length; i++) {
                  const uniqueData = {
                    ...categoryDataArray[i],
                    name: `${categoryDataArray[i].name.trim()}_${i}`
                  };
                  const created = await CategoryManager.createCategory(uniqueData);
                  createdCategories.push(created);
                }

                // Store a snapshot of all categories except the first one
                const categoriesToKeep = createdCategories.slice(1).map(cat => ({
                  id: cat.id,
                  name: cat.name,
                  emoji: cat.emoji,
                  color: cat.color,
                  bgColor: cat.bgColor,
                  keywords: [...cat.keywords],
                  isCustom: cat.isCustom,
                  createdAt: cat.createdAt
                }));

                // Delete the first category
                const categoryToDelete = createdCategories[0];
                const deleteResult = await CategoryManager.deleteCategory(categoryToDelete.id);
                
                expect(deleteResult).toBe(true);

                // Assert only the deleted category is removed
                expect(storageCategories).toHaveLength(createdCategories.length - 1);

                // Assert all other categories remain unchanged
                categoriesToKeep.forEach((expectedCat, index) => {
                  const actualCat = storageCategories.find(cat => cat.id === expectedCat.id);
                  expect(actualCat).toBeDefined();
                  expect(actualCat.name).toBe(expectedCat.name);
                  expect(actualCat.emoji).toBe(expectedCat.emoji);
                  expect(actualCat.color).toBe(expectedCat.color);
                  expect(actualCat.bgColor).toBe(expectedCat.bgColor);
                  expect(actualCat.keywords).toEqual(expectedCat.keywords);
                  expect(actualCat.isCustom).toBe(expectedCat.isCustom);
                  expect(actualCat.createdAt).toBe(expectedCat.createdAt);
                });

                // Assert deleted category is not in storage
                const deletedCat = storageCategories.find(cat => cat.id === categoryToDelete.id);
                expect(deletedCat).toBeUndefined();

                return true;
              }
            ),
            { numRuns: 30 }
          );
        });

        test('**Validates: Requirements 3.2, 10.4** - deleting all categories results in empty storage', async () => {
          eval(categoryManagerCode);

          let storageCategories = [];
          chrome.storage.sync.get = (keys, callback) => {
            callback({ categories: storageCategories });
          };

          chrome.storage.sync.set = (data, callback) => {
            storageCategories = data.categories;
            callback();
          };

          // Create multiple categories
          const categoryIds = [];
          for (let i = 0; i < 5; i++) {
            const created = await CategoryManager.createCategory({
              name: `Category${i}`,
              emoji: '💼',
              color: '#4285f4',
              bgColor: '#e8f0fe',
              keywords: [`keyword${i}`, `test${i}`]
            });
            categoryIds.push(created.id);
          }

          expect(storageCategories).toHaveLength(5);

          // Delete all categories one by one
          for (const categoryId of categoryIds) {
            const result = await CategoryManager.deleteCategory(categoryId);
            expect(result).toBe(true);
          }

          // Assert storage is completely empty
          expect(storageCategories).toHaveLength(0);
          expect(storageCategories).toEqual([]);

          // Assert no orphaned data remains
          const allKeywords = storageCategories.flatMap(cat => cat.keywords || []);
          expect(allKeywords).toEqual([]);
        });

        test('**Validates: Requirements 3.2, 10.4** - deletion is idempotent (deleting non-existent category returns false)', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.string({ minLength: 1, maxLength: 50 }),
              async (randomId) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Try to delete non-existent category
                const result = await CategoryManager.deleteCategory(randomId);
                
                // Should return false
                expect(result).toBe(false);

                // Storage should remain empty
                expect(storageCategories).toEqual([]);

                return true;
              }
            ),
            { numRuns: 50 }
          );
        });

        test('**Validates: Requirements 3.2, 10.4** - deleting category with many keywords removes all keywords', async () => {
          eval(categoryManagerCode);

          let storageCategories = [];
          chrome.storage.sync.get = (keys, callback) => {
            callback({ categories: storageCategories });
          };

          chrome.storage.sync.set = (data, callback) => {
            storageCategories = data.categories;
            callback();
          };

          // Create category with many keywords
          const manyKeywords = Array.from({ length: 50 }, (_, i) => `keyword${i}`);
          const created = await CategoryManager.createCategory({
            name: 'TestCategory',
            emoji: '💼',
            color: '#4285f4',
            bgColor: '#e8f0fe',
            keywords: manyKeywords
          });

          // Verify keywords were created
          expect(created.keywords).toHaveLength(50);
          expect(storageCategories[0].keywords).toHaveLength(50);

          // Delete the category
          const result = await CategoryManager.deleteCategory(created.id);
          expect(result).toBe(true);

          // Assert all keywords are gone
          expect(storageCategories).toEqual([]);
          const allKeywords = storageCategories.flatMap(cat => cat.keywords || []);
          expect(allKeywords).toEqual([]);
          
          // Verify none of the original keywords remain
          manyKeywords.forEach(keyword => {
            expect(allKeywords).not.toContain(keyword);
          });
        });

        test('**Validates: Requirements 3.2, 10.4** - sequential deletions maintain data integrity', async () => {
          await fc.assert(
            fc.asyncProperty(
              fc.array(
                fc.record({
                  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                  emoji: fc.constantFrom('💼', '✈️', '📧'),
                  color: fc.constantFrom('#4285f4', '#1976d2', '#ff6d00'),
                  bgColor: fc.constantFrom('#e8f0fe', '#e3f2fd', '#fff3e0'),
                  keywords: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { maxLength: 5 })
                }),
                { minLength: 3, maxLength: 8 }
              ),
              async (categoryDataArray) => {
                eval(categoryManagerCode);

                let storageCategories = [];
                chrome.storage.sync.get = (keys, callback) => {
                  callback({ categories: storageCategories });
                };

                chrome.storage.sync.set = (data, callback) => {
                  storageCategories = data.categories;
                  callback();
                };

                // Create multiple categories
                const createdCategories = [];
                for (let i = 0; i < categoryDataArray.length; i++) {
                  const uniqueData = {
                    ...categoryDataArray[i],
                    name: `${categoryDataArray[i].name.trim()}_${i}`
                  };
                  const created = await CategoryManager.createCategory(uniqueData);
                  createdCategories.push(created);
                }

                const initialCount = createdCategories.length;
                expect(storageCategories).toHaveLength(initialCount);

                // Delete every other category
                const deletedIds = [];
                for (let i = 0; i < createdCategories.length; i += 2) {
                  const result = await CategoryManager.deleteCategory(createdCategories[i].id);
                  expect(result).toBe(true);
                  deletedIds.push(createdCategories[i].id);
                }

                // Assert correct number of categories remain
                const expectedRemaining = initialCount - deletedIds.length;
                expect(storageCategories).toHaveLength(expectedRemaining);

                // Assert deleted categories are not in storage
                deletedIds.forEach(deletedId => {
                  const found = storageCategories.find(cat => cat.id === deletedId);
                  expect(found).toBeUndefined();
                });

                // Assert remaining categories are intact
                const remainingIds = createdCategories
                  .filter((_, i) => i % 2 !== 0)
                  .map(cat => cat.id);
                
                remainingIds.forEach(remainingId => {
                  const found = storageCategories.find(cat => cat.id === remainingId);
                  expect(found).toBeDefined();
                  expect(found.id).toBe(remainingId);
                });

                return true;
              }
            ),
            { numRuns: 30 }
          );
        });
      });
    });
  });

  describe('validateCategory', () => {
    beforeEach(() => {
      eval(categoryManagerCode);
    });

    test('should return valid for correct category data', () => {
      const validData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe',
        keywords: ['meeting', 'project']
      };

      const result = CategoryManager.validateCategory(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should validate name is required', () => {
      const invalidData = {
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'name', message: 'Name is required' });
    });

    test('should validate name cannot be empty after trim', () => {
      const invalidData = {
        name: '   ',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'name', message: 'Name cannot be empty' });
    });

    test('should validate name length (max 20 characters)', () => {
      const invalidData = {
        name: 'This is a very long category name that exceeds twenty characters',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'name', message: 'Name must be 20 characters or less' });
    });

    test('should validate emoji is required', () => {
      const invalidData = {
        name: 'Work',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'emoji', message: 'Emoji or Icon is required' });
    });

    test('should validate emoji format', () => {
      const invalidData = {
        name: 'Work',
        emoji: 'NOT AN EMOJI!',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'emoji', message: 'Invalid icon or emoji format' });
    });

    test('should validate text color format', () => {
      const invalidData = {
        name: 'Work',
        emoji: '💼',
        color: 'blue',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'color', message: 'Invalid text color' });
    });

    test('should validate background color format', () => {
      const invalidData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: 'not-a-color'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'bgColor', message: 'Invalid background color' });
    });

    test('should validate keywords length (max 50 characters)', () => {
      const invalidData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe',
        keywords: ['valid', 'this is a very long keyword that exceeds the fifty character limit for keywords']
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'keywords' && e.message.includes('exceeds 50 characters'))).toBe(true);
    });

    test('should validate keywords are non-empty strings', () => {
      const invalidData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe',
        keywords: ['valid', '   ', 'another']
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'keywords', message: 'Keyword 2 is invalid' });
    });

    test('should allow empty keywords array', () => {
      const validData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe',
        keywords: []
      };

      const result = CategoryManager.validateCategory(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should allow missing keywords field', () => {
      const validData = {
        name: 'Work',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return multiple errors for multiple invalid fields', () => {
      const invalidData = {
        name: '',
        emoji: 'INVALID EMOJI!',
        color: 'red',
        bgColor: 'blue'
      };

      const result = CategoryManager.validateCategory(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    test('should trim name before validating length', () => {
      const validData = {
        name: '  Work  ',
        emoji: '💼',
        color: '#4285f4',
        bgColor: '#e8f0fe'
      };

      const result = CategoryManager.validateCategory(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    describe('Property 6: Validation Rejects Invalid Data', () => {
      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects empty names', () => {
        fc.assert(
          fc.property(
            fc.constantFrom('', '   ', '\t', '\n', '  \t\n  '),
            (emptyName) => {
              const data = {
                name: emptyName,
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe'
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'name' && 
                                           (e.message === 'Name cannot be empty' || e.message === 'Name is required'));
            }
          ),
          { numRuns: 10 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects names over 20 characters', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 21, maxLength: 100 }),
            (longName) => {
              const data = {
                name: longName,
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe'
              };
              const result = CategoryManager.validateCategory(data);
              // Only check if the trimmed name is actually > 20 chars
              if (longName.trim().length > 20) {
                return result.valid === false && 
                       result.errors.some(e => e.field === 'name' && 
                                             e.message === 'Name must be 20 characters or less');
              }
              return true; // Skip if trimmed name is <= 20 chars
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects boundary case: exactly 21 characters', () => {
        const data = {
          name: 'a'.repeat(21), // Exactly 21 characters
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe'
        };
        const result = CategoryManager.validateCategory(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual({ 
          field: 'name', 
          message: 'Name must be 20 characters or less' 
        });
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation accepts boundary case: exactly 20 characters', () => {
        const data = {
          name: 'a'.repeat(20), // Exactly 20 characters
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe'
        };
        const result = CategoryManager.validateCategory(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects missing emoji', () => {
        fc.assert(
          fc.property(
            fc.constantFrom(undefined, null, ''),
            (invalidEmoji) => {
              const data = {
                name: 'Work',
                emoji: invalidEmoji,
                color: '#4285f4',
                bgColor: '#e8f0fe'
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'emoji');
            }
          ),
          { numRuns: 10 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects invalid emoji format', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Strings with uppercase letters (not valid icon names or emojis)
              fc.string({ minLength: 1, maxLength: 10 }).filter(s => /[A-Z]/.test(s) && !/^[a-z0-9\-]+$/.test(s)),
              fc.constantFrom('ABC', 'Hello World', 'TEST', '!@#$%', 'Has Space')
            ),
            (invalidEmoji) => {
              const data = {
                name: 'Work',
                emoji: invalidEmoji,
                color: '#4285f4',
                bgColor: '#e8f0fe'
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'emoji' && 
                                           e.message === 'Invalid icon or emoji format');
            }
          ),
          { numRuns: 50 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects invalid color formats', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              // Missing # prefix
              fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 6, maxLength: 6 }).map(arr => 
                arr.map(n => n.toString(16)).join('')
              ),
              // Wrong length (too long, 7+ hex chars)
              fc.constantFrom('#FFFFFFF', '#12345678'),
              // Wrong length (too short, 1-2 hex chars)
              fc.constantFrom('#12', '#F'),
              // Named colors and non-string types
              fc.constantFrom('blue', 'red', null, undefined)
            ),
            (invalidColor) => {
              const data = {
                name: 'Work',
                emoji: '💼',
                color: invalidColor,
                bgColor: '#e8f0fe'
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'color' && 
                                           e.message === 'Invalid text color');
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects invalid background color formats', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constantFrom('#FFFFFFF', 'blue', '', null, undefined, '#12', 'red')
            ),
            (invalidBgColor) => {
              const data = {
                name: 'Work',
                emoji: '💼',
                color: '#4285f4',
                bgColor: invalidBgColor
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'bgColor' && 
                                           e.message === 'Invalid background color');
            }
          ),
          { numRuns: 50 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects keywords over 50 characters', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 51, maxLength: 100 }),
            (longKeyword) => {
              const data = {
                name: 'Work',
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe',
                keywords: ['valid', longKeyword]
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'keywords' && 
                                           e.message.includes('exceeds 50 characters'));
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects boundary case: exactly 51 character keyword', () => {
        const data = {
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: ['a'.repeat(51)] // Exactly 51 characters
        };
        const result = CategoryManager.validateCategory(data);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.field === 'keywords' && 
                                      e.message.includes('exceeds 50 characters'))).toBe(true);
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation accepts boundary case: exactly 50 character keyword', () => {
        const data = {
          name: 'Work',
          emoji: '💼',
          color: '#4285f4',
          bgColor: '#e8f0fe',
          keywords: ['a'.repeat(50)] // Exactly 50 characters
        };
        const result = CategoryManager.validateCategory(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation rejects empty/whitespace keywords', () => {
        fc.assert(
          fc.property(
            fc.constantFrom('', '   ', '\t', '\n'),
            (emptyKeyword) => {
              const data = {
                name: 'Work',
                emoji: '💼',
                color: '#4285f4',
                bgColor: '#e8f0fe',
                keywords: ['valid', emptyKeyword, 'another']
              };
              const result = CategoryManager.validateCategory(data);
              return result.valid === false && 
                     result.errors.some(e => e.field === 'keywords' && 
                                           e.message.includes('is invalid'));
            }
          ),
          { numRuns: 10 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation returns specific error messages for each invalid field', () => {
        fc.assert(
          fc.property(
            fc.record({
              name: fc.constantFrom('', 'a'.repeat(21)),
              emoji: fc.constantFrom('invalid', ''),
              color: fc.constantFrom('blue', '#FFF'),
              bgColor: fc.constantFrom('red', '#FF'),
              keywords: fc.constantFrom(['a'.repeat(51)], ['', 'valid'])
            }),
            (invalidData) => {
              const result = CategoryManager.validateCategory(invalidData);
              // Should be invalid
              if (!result.valid) {
                // Should have specific error messages
                const hasNameError = result.errors.some(e => e.field === 'name' && e.message);
                const hasEmojiError = result.errors.some(e => e.field === 'emoji' && e.message);
                const hasColorError = result.errors.some(e => e.field === 'color' && e.message);
                const hasBgColorError = result.errors.some(e => e.field === 'bgColor' && e.message);
                const hasKeywordError = result.errors.some(e => e.field === 'keywords' && e.message);
                
                // At least one error should be present with a message
                return hasNameError || hasEmojiError || hasColorError || hasBgColorError || hasKeywordError;
              }
              return true;
            }
          ),
          { numRuns: 50 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation is idempotent (same input produces same result)', () => {
        fc.assert(
          fc.property(
            fc.record({
              name: fc.oneof(fc.string({ minLength: 1, maxLength: 30 }), fc.constant('')),
              emoji: fc.oneof(fc.constantFrom('💼', '✈️', '📧'), fc.constant('invalid')),
              color: fc.oneof(fc.constant('#4285f4'), fc.constant('blue')),
              bgColor: fc.oneof(fc.constant('#e8f0fe'), fc.constant('#FFF')),
              keywords: fc.oneof(
                fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 5 }),
                fc.constant([])
              )
            }),
            (data) => {
              const result1 = CategoryManager.validateCategory(data);
              const result2 = CategoryManager.validateCategory(data);
              
              // Results should be identical
              return result1.valid === result2.valid && 
                     result1.errors.length === result2.errors.length;
            }
          ),
          { numRuns: 100 }
        );
      });

      test('**Validates: Requirements 1.2, 1.6, 4.5** - validation handles missing required fields', () => {
        fc.assert(
          fc.property(
            fc.record({
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              emoji: fc.option(fc.constantFrom('💼', '✈️'), { nil: undefined }),
              color: fc.option(fc.constant('#4285f4'), { nil: undefined }),
              bgColor: fc.option(fc.constant('#e8f0fe'), { nil: undefined })
            }),
            (data) => {
              const result = CategoryManager.validateCategory(data);
              
              // If any required field is missing, validation should fail
              if (!data.name || !data.emoji || !data.color || !data.bgColor) {
                return result.valid === false && result.errors.length > 0;
              }
              
              return true;
            }
          ),
          { numRuns: 50 }
        );
      });
    });
  });
});
