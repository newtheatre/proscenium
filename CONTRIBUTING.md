# Contributing to Proscenium

Thank you for your interest in contributing to Proscenium! This guide will help you get started.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Bun](https://bun.sh/) (latest version recommended)
- [Git](https://git-scm.com/)

### Setup Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/newtheatre/proscenium.git
   cd proscenium
   ```

3. Install dependencies:
   ```bash
   bun install
   ```

4. Set up the database:
   ```bash
   # Generate Prisma client
   bun prisma generate
   
   # Run migrations
   bun prisma migrate dev
   ```

5. Start the development server:
   ```bash
   bun run dev
   ```

## 🔄 Development Workflow

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
3. Test your changes locally
4. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add new feature description"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request

## 📝 Commit Convention

We don't have any conventions for commit messages at the moment. If you would like to suggest some, please open a feature request or start a discussion.

## 📋 Pull Request Guidelines

- Fill out the PR template completely
- Update documentation if needed
- Keep PRs focused and atomic
- Link related issues

## 🐛 Reporting Bugs

Please use the bug report template and include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment information
- Screenshots if applicable

## 💡 Suggesting Features

Use the feature request template and include:
- Clear use case and problem statement
- Proposed solution
- Acceptance criteria
- Any implementation ideas

## 📚 Code Style

- Follow the existing code patterns
- Use TypeScript for type safety
- Lint & format with ESLint
- Write meaningful variable and function names
- Add comments for complex logic

## 🏗️ Project Structure

```
├── app/                # Nuxt 4 application code
│   ├── components/     # Vue components
│   ├── composables/    # Vue composables
│   ├── layouts/        # Layout components
│   ├── middleware/     # Route middleware
│   ├── pages/          # Page components (file-based routing)
│   └── utils/          # Utility functions
├── content/            # Nuxt Content files
├── prisma/             # Database schema and migrations
├── server/             # Server-side code (API routes)
└── shared/             # Shared types and utilities
```

## ❓ Getting Help

- Check existing issues and discussions
- Talk to a member of the New Theatre committee
- Ask questions using the question template

Thank you for contributing! 🎭
