# Python MCP Implementation

This directory contains the Python implementation of the MCP (Multi-Collateral Pool) system using FastAPI.

## Prerequisites

- Python 3.8+
- Poetry (for dependency management and packaging)

## Setup

1. **Install Poetry:**
   If you don't have Poetry installed, follow the instructions on the [official Poetry website](https://python-poetry.org/docs/#installation).

2. **Install dependencies:**
   Navigate to this directory (`src/python/mcp`) in your terminal and run:
   ```bash
   poetry install
   ```

## Running the Application

To run the FastAPI application locally:
```bash
poetry run uvicorn mcp_fastapi.main:app --reload
```
The application will typically be available at `http://127.0.0.1:8000`.

The command specifies `mcp_fastapi.main:app` because:
- `mcp_fastapi` is the package directory containing your application code (as configured in `pyproject.toml`).
- `main` is the Python file (`main.py`) within that package.
- `app` is the FastAPI application instance created in `main.py`.
- This command should be run from the `src/python/mcp` directory.

## Running Tests

To execute the test suite:
```bash
poetry run pytest
```
