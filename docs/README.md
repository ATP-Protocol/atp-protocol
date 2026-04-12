# ATP Protocol Documentation

Complete documentation for the Agent Trust Protocol (ATP) — a governance framework for controlling and auditing autonomous agent execution.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run start

# Build for production
npm run build

# Deploy
npm run deploy
```

The documentation site will be available at `http://localhost:3000`.

## Documentation Structure

- **`docs/intro.md`** — Introduction to ATP and the 5-layer trust stack
- **`docs/quick-start.md`** — Get up and running in 5 minutes
- **`docs/spec/`** — Full specification (14 sections):
  - Overview
  - Execution Contracts
  - Authority Model
  - Policy Evaluation
  - Approval State Machine
  - Credential Brokerage
  - Execution Semantics
  - Evidence & Attestation
- **`docs/sdk/`** — SDK documentation:
  - Overview
  - TypeScript API reference
  - Python API reference
- **`docs/gateway/`** — Gateway deployment:
  - Overview & architecture
  - Internal architecture
  - Deployment guide
- **`docs/conformance/`** — Certification:
  - Overview
  - Conformance levels (1-4)
  - Testing guide
  - Certification process

## Building the Site

### Local Development

```bash
npm install
npm run start
```

Site runs at `http://localhost:3000`. Changes auto-reload.

### Production Build

```bash
npm run build
npm run serve
```

Builds static site to `build/` directory.

### Deploy to GitHub Pages

```bash
npm run deploy
```

Deploys to `https://atp-protocol.org`.

## Configuration

Edit `docusaurus.config.js` to customize:
- Site title and tagline
- GitHub links and organization
- Theme colors (dark/light)
- Navbar items and structure

Edit `sidebars.js` to customize navigation structure.

## Content Guidelines

### Frontmatter

All Markdown files should have YAML frontmatter:

```yaml
---
sidebar_position: 1
---
```

### Code Examples

Use language-specific syntax highlighting:

````markdown
```typescript
const atp = new ATP({ ... });
```

```json
{ "example": "json" }
```

```bash
npm install @atp-protocol/sdk
```
````

### Links

Use Docusaurus link syntax:

```markdown
[Quick Start](../quick-start.md)
[Specification](./spec/overview.md)
```

### Images

Store images in `static/img/` and reference:

```markdown
![Alt text](/img/image.png)
```

## Structure

```
docs/
├── docusaurus.config.js      # Site configuration
├── sidebars.js                # Navigation structure
├── package.json               # Dependencies
├── docs/                      # Content pages
│   ├── intro.md
│   ├── quick-start.md
│   ├── spec/
│   │   ├── overview.md
│   │   ├── contracts.md
│   │   ├── authority.md
│   │   ├── policy.md
│   │   ├── approval.md
│   │   ├── credentials.md
│   │   ├── execution.md
│   │   └── evidence.md
│   ├── sdk/
│   │   ├── overview.md
│   │   ├── typescript.md
│   │   └── python.md
│   ├── gateway/
│   │   ├── overview.md
│   │   ├── architecture.md
│   │   └── deployment.md
│   └── conformance/
│       ├── overview.md
│       ├── levels.md
│       ├── testing.md
│       └── certification.md
├── static/                    # Images, logos, assets
│   └── img/
│       ├── logo.svg
│       ├── favicon.ico
│       └── atp-social-card.jpg
├── src/
│   └── css/
│       └── custom.css
└── blog/                      # Optional: blog posts
```

## Publishing

The site is published to GitHub Pages:

1. Push to `main` branch
2. GitHub Actions builds and deploys to `gh-pages`
3. Site goes live at `https://atp-protocol.org`

## Customization

### Theme

Default: Dark mode with dracula syntax highlighting. Customize in:

```javascript
// docusaurus.config.js
themeConfig: {
  colorMode: {
    defaultMode: 'dark',
    disableSwitch: false,
  },
  prism: {
    theme: prismThemes.github,
    darkTheme: prismThemes.dracula,
  }
}
```

### Colors

Edit `src/css/custom.css` for custom CSS variables.

### Navbar

Edit `sidebars.js` to change navigation items.

## Troubleshooting

### Port already in use

```bash
npm run start -- --port 3001
```

### Build errors

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Deployment issues

Check GitHub Actions logs in `.github/workflows/`.

## Contributing

To add new documentation:

1. Create Markdown file in appropriate `docs/` subdirectory
2. Add frontmatter with `sidebar_position`
3. Update `sidebars.js` if adding new section
4. Run locally and verify: `npm run start`
5. Commit and push

## License

ATP Protocol documentation is licensed under CC-BY-4.0.

## Resources

- **GitHub:** [ATP-Protocol/atp-protocol](https://github.com/ATP-Protocol/atp-protocol)
- **TypeScript SDK:** [ATP-Protocol/atp-protocol-sdk-ts](https://github.com/ATP-Protocol/atp-protocol-sdk-ts)
- **Python SDK:** [ATP-Protocol/atp-protocol-sdk-py](https://github.com/ATP-Protocol/atp-protocol-sdk-py)
- **Reference Gateway:** [ATP-Protocol/atp-gateway](https://github.com/ATP-Protocol/atp-gateway)
- **Conformance Suite:** [ATP-Protocol/atp-conformance](https://github.com/ATP-Protocol/atp-conformance)

## Support

- GitHub Issues: [ATP-Protocol/atp-protocol/issues](https://github.com/ATP-Protocol/atp-protocol/issues)
- Discussions: [ATP-Protocol/atp-protocol/discussions](https://github.com/ATP-Protocol/atp-protocol/discussions)
- Email: docs@atp-protocol.org
