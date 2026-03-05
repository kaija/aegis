# Aegis Mail

Chrome Extension for intelligent email categorization and security analysis.

## Features

- 🎯 Smart email categorization (local keyword rules or AI)
- 🛡️ Security analysis with phishing detection
- 📊 Safety scoring (0-100)
- 🔍 Whitelist-based domain validation
- 🌐 Bilingual support (English & Traditional Chinese)
- 🔒 Privacy-focused (local analysis by default)

## Development

### Setup

```bash
# Install dependencies
npm install

# Build for development
make dev

# Load extension in Chrome
# 1. Open chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the dist/ folder
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Test specific module
npm run test:analyzer
npm run test:whitelist
npm run test:ai
```

**Test Results**: ✅ 65/65 tests passing

See [TESTING.md](TESTING.md) for detailed testing guide.

### Build

```bash
make dev     # Development build
make zip     # Package for Chrome Web Store
make crx     # Package for self-distribution
make clean   # Clean build artifacts
```

## Project Structure

```
aegis/
├── src/
│   ├── analysis/          # Email analysis logic
│   ├── platforms/         # Platform adapters (Gmail)
│   ├── ui/                # UI components
│   └── data/              # Whitelist data
├── __tests__/             # Unit tests
├── styles/                # CSS
├── public/                # Icons
└── dist/                  # Build output
```

## Documentation

- [DEVELOP.md](DEVELOP.md) - Comprehensive developer guide (Chinese)
- [TESTING.md](TESTING.md) - Testing guide
- [TEST-RESULTS.md](TEST-RESULTS.md) - Test results report
- [SECURITY-ENHANCEMENT.md](SECURITY-ENHANCEMENT.md) - Security features

## Technology Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES6+)
- Jest for testing
- No build tools required

## Testing Coverage

- ✅ Email categorization (keyword-based)
- ✅ Security scoring (phishing detection)
- ✅ Whitelist validation
- ✅ Spoofing detection
- ✅ Link analysis
- ✅ Boundary conditions

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub.
