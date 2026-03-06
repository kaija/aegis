'use strict';

const CategoryManager = (() => {
  // In-memory cache for categories
  let _categoryCache = null;

  /**
   * Retrieves all categories from chrome.storage.sync
   * @returns {Promise<Array>} - Array of category objects
   */
  async function getCategories() {
    try {
      // Return cached categories if available
      if (_categoryCache !== null) {
        return _categoryCache;
      }

      // Read from chrome.storage.sync
      const result = await new Promise((resolve, reject) => {
        chrome.storage.sync.get(['categories'], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });

      // If no categories exist, return empty array
      const categories = result.categories || [];

      // Update cache
      _categoryCache = categories;

      return categories;
    } catch (error) {
      console.error('[CategoryManager] Error reading categories:', error);
      throw error;
    }
  }

  /**
   * Creates a new category and persists it to chrome.storage.sync
   * @param {Object} categoryData - Category data (name, emoji, color, bgColor, keywords)
   * @returns {Promise<Object>} - The created category object
   */
  async function createCategory(categoryData) {
    try {
      // Step 1: Validate input data (Requirement 1.2)
      const validation = validateCategory(categoryData);
      if (!validation.valid) {
        const errorMessage = validation.errors.map(e => e.message).join(', ');
        throw new Error(errorMessage);
      }

      // Step 2: Check for duplicate names (case-insensitive) (Requirements 1.5, 8.2)
      const existingCategories = await getCategories();
      const nameLower = categoryData.name.trim().toLowerCase();
      const duplicate = existingCategories.find(
        cat => cat.name.toLowerCase() === nameLower
      );
      if (duplicate) {
        throw new Error(`Category name '${categoryData.name.trim()}' already exists`);
      }

      // Step 3: Generate unique ID (Requirement 8.1)
      const categoryId = ValidationHelpers.generateCategoryId();

      // Step 4: Create category object (Requirements 1.3, 7.1)
      const newCategory = {
        id: categoryId,
        name: categoryData.name.trim(),
        emoji: categoryData.emoji,
        color: categoryData.color,
        bgColor: categoryData.bgColor,
        keywords: categoryData.keywords || [],
        isCustom: true,
        createdAt: Date.now()
      };

      // Step 5: Save to chrome.storage.sync (Requirement 7.1)
      const updatedCategories = [...existingCategories, newCategory];
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ categories: updatedCategories }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // Step 6: Invalidate cache and return new category
      _invalidateCache();
      return newCategory;
    } catch (error) {
      // Handle storage errors (Requirements 8.1, 8.2)
      console.error('[CategoryManager] Error creating category:', error);
      throw error;
    }
  }

  /**
   * Updates an existing category in chrome.storage.sync
   * @param {string} categoryId - The ID of the category to update
   * @param {Object} updates - Object containing fields to update
   * @returns {Promise<Object>} - The updated category object
   */
  async function updateCategory(categoryId, updates) {
    try {
      // Step 1: Validate categoryId exists (Requirement 2.2)
      const existingCategories = await getCategories();
      const categoryIndex = existingCategories.findIndex(cat => cat.id === categoryId);

      if (categoryIndex === -1) {
        throw new Error(`Category with ID '${categoryId}' not found`);
      }

      const existingCategory = existingCategories[categoryIndex];

      // Step 2: Validate updated fields using validateCategory() (Requirement 2.2)
      // Create a merged object for validation (existing + updates)
      const mergedData = {
        name: updates.name !== undefined ? updates.name : existingCategory.name,
        emoji: updates.emoji !== undefined ? updates.emoji : existingCategory.emoji,
        color: updates.color !== undefined ? updates.color : existingCategory.color,
        bgColor: updates.bgColor !== undefined ? updates.bgColor : existingCategory.bgColor,
        keywords: updates.keywords !== undefined ? updates.keywords : existingCategory.keywords
      };

      const validation = validateCategory(mergedData);
      if (!validation.valid) {
        const errorMessage = validation.errors.map(e => e.message).join(', ');
        throw new Error(errorMessage);
      }

      // Step 3: Check for duplicate names if name is being updated (Requirement 2.4)
      if (updates.name !== undefined) {
        const nameLower = updates.name.trim().toLowerCase();
        const duplicate = existingCategories.find(
          cat => cat.id !== categoryId && cat.name.toLowerCase() === nameLower
        );
        if (duplicate) {
          throw new Error(`Category name '${updates.name.trim()}' already exists`);
        }
      }

      // Step 4: Merge updates with existing category (preserve unchanged fields) (Requirement 2.2)
      const updatedCategory = {
        ...existingCategory,
        ...(updates.name !== undefined && { name: updates.name.trim() }),
        ...(updates.emoji !== undefined && { emoji: updates.emoji }),
        ...(updates.color !== undefined && { color: updates.color }),
        ...(updates.bgColor !== undefined && { bgColor: updates.bgColor }),
        ...(updates.keywords !== undefined && { keywords: updates.keywords })
      };

      // Step 5: Save to chrome.storage.sync (Requirement 7.1)
      const updatedCategories = [...existingCategories];
      updatedCategories[categoryIndex] = updatedCategory;

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ categories: updatedCategories }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // Step 6: Invalidate cache and return updated category
      _invalidateCache();
      return updatedCategory;
    } catch (error) {
      // Handle storage errors (Requirement 7.1)
      console.error('[CategoryManager] Error updating category:', error);
      throw error;
    }
  }

  /**
   * Deletes a category from chrome.storage.sync
   * @param {string} categoryId - The ID of the category to delete
   * @returns {Promise<boolean>} - True if deletion successful, false otherwise
   */
  async function deleteCategory(categoryId) {
    try {
      // Step 1: Get current categories
      const existingCategories = await getCategories();

      // Step 2: Find category by ID (Requirement 3.2)
      const categoryIndex = existingCategories.findIndex(cat => cat.id === categoryId);

      // Step 3: Return false if not found
      if (categoryIndex === -1) {
        console.warn(`[CategoryManager] Category with ID '${categoryId}' not found`);
        return false;
      }

      // Step 4: Remove category from array (Requirements 3.2, 10.4)
      const updatedCategories = existingCategories.filter(cat => cat.id !== categoryId);

      // Step 5: Save updated array to chrome.storage.sync (Requirement 7.1)
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ categories: updatedCategories }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // Step 6: Invalidate cache and return success
      _invalidateCache();
      return true;
    } catch (error) {
      // Handle storage errors (Requirement 7.1)
      console.error('[CategoryManager] Error deleting category:', error);
      throw error;
    }
  }

  /**
   * Validates category data against defined rules
   * @param {Object} categoryData - Category data to validate
   * @returns {Object} - ValidationResult with valid flag and errors array
   */
  function validateCategory(categoryData) {
    const errors = [];

    // Validate name (Requirement 4.1)
    if (!categoryData.name || typeof categoryData.name !== 'string') {
      errors.push({ field: 'name', message: 'Name is required' });
    } else {
      const trimmedName = categoryData.name.trim();
      if (trimmedName.length === 0) {
        errors.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (trimmedName.length > 20) {
        errors.push({ field: 'name', message: 'Name must be 20 characters or less' });
      }
    }

    // Validate emoji/icon (Requirement 4.2)
    if (!categoryData.emoji || typeof categoryData.emoji !== 'string') {
      errors.push({ field: 'emoji', message: 'Emoji or Icon is required' });
    } else if (!ValidationHelpers.isValidIconOrEmoji(categoryData.emoji)) {
      errors.push({ field: 'emoji', message: 'Invalid icon or emoji format' });
    }

    // Validate text color (Requirement 4.3)
    if (!ValidationHelpers.isValidColor(categoryData.color)) {
      errors.push({ field: 'color', message: 'Invalid text color' });
    }

    // Validate background color (Requirement 4.3)
    if (!ValidationHelpers.isValidColor(categoryData.bgColor)) {
      errors.push({ field: 'bgColor', message: 'Invalid background color' });
    }

    // Validate keywords if present (Requirement 4.4)
    if (categoryData.keywords && Array.isArray(categoryData.keywords)) {
      categoryData.keywords.forEach((keyword, index) => {
        if (typeof keyword !== 'string' || keyword.trim().length === 0) {
          errors.push({ field: 'keywords', message: `Keyword ${index + 1} is invalid` });
        } else if (keyword.length > 50) {
          errors.push({ field: 'keywords', message: `Keyword "${keyword}" exceeds 50 characters` });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Returns default color pair for new categories
   * @returns {Object} - Object with color and bgColor properties
   */
  function getDefaultColors() {
    // Implementation will be added in task 2.10
    return {
      color: '#4285f4',
      bgColor: '#e8f0fe'
    };
  }

  /**
   * Invalidates the category cache (used after CRUD operations)
   * @private
   */
  function _invalidateCache() {
    _categoryCache = null;
  }

  return {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    validateCategory,
    getDefaultColors
  };
})();

window.CategoryManager = CategoryManager;
