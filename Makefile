EXTENSION_NAME := aegis
VERSION        := $(shell node -p "require('./manifest.json').version" 2>/dev/null || echo "1.0.0")
OUT_DIR        := dist
ZIP_FILE       := $(OUT_DIR)/$(EXTENSION_NAME)-$(VERSION).zip
CRX_FILE       := $(OUT_DIR)/$(EXTENSION_NAME)-$(VERSION).crx
KEY_FILE       := $(EXTENSION_NAME).pem

CHROME := $(shell \
command -v google-chrome 2>/dev/null || \
command -v google-chrome-stable 2>/dev/null || \
echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

# Files to exclude from rsync (dev/system files)
RSYNC_EXCLUDE := \
--exclude="*.pem" \
--exclude=".DS_Store" \
--exclude=".git" \
--exclude=".git/" \
--exclude=".claude" \
--exclude=".claude/" \
--exclude=".kiro" \
--exclude=".kiro/" \
--exclude=".vscode" \
--exclude=".vscode/" \
--exclude="__tests__" \
--exclude="__tests__/" \
--exclude="node_modules" \
--exclude="node_modules/" \
--exclude="coverage" \
--exclude="coverage/" \
--exclude="dist" \
--exclude="dist/" \
--exclude="scripts" \
--exclude="scripts/" \
--exclude="backend" \
--exclude="backend/" \
--exclude="*.md" \
--exclude="TEST-*.txt" \
--exclude="TEST-*.md" \
--exclude="CLAUDE.md" \
--exclude="Makefile" \
--exclude="*.map" \
--exclude="*.csv" \
--exclude="package.json" \
--exclude="package-lock.json" \
--exclude="jest.config.js" \
--exclude=".gitignore" \
--exclude="mock-chrome.js" \
--exclude="aegis-*.json" \
--exclude="aegis-*.csv" \
--exclude=".env" \
--exclude=".env.local"

.PHONY: all zip crx dev clean help inject-secrets info

all: zip ## Default: build zip package

## ── Build targets ──────────────────────────────────────────────────────────

dev: ## Copy extension files to dist/ for local unpacked loading
	@rm -rf $(OUT_DIR)
	@rsync -a $(RSYNC_EXCLUDE) . $(OUT_DIR)/
	@$(MAKE) --no-print-directory inject-secrets
	@echo "Ready: load $(OUT_DIR)/ as unpacked extension in Chrome"

inject-secrets: ## Inject build-time secrets from .env into dist/
	@if [ -f .env ]; then \
	. ./.env && \
	if [ -n "$$GA_API_SECRET" ]; then \
	find $(OUT_DIR) -name '*.js' -exec sed -i '' "s/__GA_API_SECRET__/$$GA_API_SECRET/g" {} + 2>/dev/null || \
	find $(OUT_DIR) -name '*.js' -exec sed -i "s/__GA_API_SECRET__/$$GA_API_SECRET/g" {} + ; \
	echo "  ✓ Injected GA_API_SECRET"; \
	fi; \
	else \
	echo "  ⚠ .env not found — GA tracking will be disabled"; \
	fi

zip: dev ## Pack extension as .zip (for Chrome Web Store)
	@echo "Packing $(ZIP_FILE)..."
	@cd $(OUT_DIR) && zip -r -9 "../$(ZIP_FILE)" . \
	-x "$(EXTENSION_NAME)-*.zip" \
	-x "$(EXTENSION_NAME)-*.crx"
	@echo "Done: $(ZIP_FILE)"

crx: $(OUT_DIR) ## Pack extension as .crx (self-distribution)
	@echo "Packing $(CRX_FILE)..."
	@if [ -f "$(KEY_FILE)" ]; then \
	"$(CHROME)" \
	--pack-extension="$(CURDIR)" \
	--pack-extension-key="$(CURDIR)/$(KEY_FILE)" \
	--no-message-box 2>/dev/null; \
	else \
	echo "No key file found — Chrome will generate $(KEY_FILE)"; \
	"$(CHROME)" \
	--pack-extension="$(CURDIR)" \
	--no-message-box 2>/dev/null; \
	fi
	@if [ -f "../$(notdir $(CURDIR)).crx" ]; then \
	mv "../$(notdir $(CURDIR)).crx" "$(CRX_FILE)"; \
	echo "Done: $(CRX_FILE)"; \
	elif [ -f "../$(notdir $(CURDIR)).pem" ] && [ ! -f "$(KEY_FILE)" ]; then \
	mv "../$(notdir $(CURDIR)).pem" "$(KEY_FILE)"; \
	echo "Generated key: $(KEY_FILE) — run 'make crx' again to produce .crx"; \
	fi

## ── Utilities ───────────────────────────────────────────────────────────────

$(OUT_DIR):
	@mkdir -p $(OUT_DIR)

clean: ## Remove dist directory
	@rm -rf $(OUT_DIR)
	@echo "Cleaned dist/"

info: ## Show extension info
	@echo "Name:    $(EXTENSION_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Chrome:  $(CHROME)"
	@echo "Output:  $(OUT_DIR)/"

help: ## Show this help
	@echo "Usage: make [target]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Output files go to: $(OUT_DIR)/"
