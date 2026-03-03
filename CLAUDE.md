# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This project is in early development. Currently only icon assets exist (`public/icons/` with 16, 32, 48, and 128px PNGs), suggesting this is intended to be a browser extension.

## Architecture

No source code or build system has been established yet. When scaffolding begins, follow the conventions in the global CLAUDE.md:
- Frontend: Next.js (TypeScript)
- Backend (if needed): Python with `pyproject.toml`, or Go/Rust for high-performance APIs
- Infrastructure: Terraform + Terragrunt; Docker + Docker Compose for local dev
