from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI(
    title="Python MCP FastAPI",
    description="A Multi-Collateral Pool (MCP) system implemented in Python with FastAPI.",
    version="0.1.0",
)

# --- Pydantic Models (Data Structures) ---

class Collateral(BaseModel):
    asset_id: str = Field(..., description="Unique identifier for the asset, e.g., 'BTC', 'ETH'")
    amount: float = Field(..., gt=0, description="Amount of the asset")
    value_usd: float = Field(..., gt=0, description="Current value of the collateral in USD")

class Pool(BaseModel):
    pool_id: str = Field(..., description="Unique identifier for the pool")
    collaterals: List[Collateral] = []
    total_value_usd: float = 0.0
    is_active: bool = True

# In-memory storage for simplicity
db: Dict[str, Pool] = {}

# --- Helper Functions (MCP Logic Placeholder) ---

def _calculate_pool_value(pool: Pool) -> float:
    """Recalculates the total value of a pool based on its collaterals."""
    return sum(c.value_usd for c in pool.collaterals)

def _get_pool_or_404(pool_id: str) -> Pool:
    """Retrieves a pool or raises HTTPException if not found."""
    pool = db.get(pool_id)
    if not pool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pool '{pool_id}' not found")
    return pool

# --- FastAPI Endpoints ---

@app.post("/pools/", response_model=Pool, status_code=status.HTTP_201_CREATED, tags=["Pools"])
async def create_pool(pool_id: str, is_active: Optional[bool] = True) -> Pool:
    """
    Creates a new, empty collateral pool.
    """
    if pool_id in db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pool '{pool_id}' already exists"
        )
    new_pool = Pool(pool_id=pool_id, is_active=is_active)
    db[pool_id] = new_pool
    return new_pool

@app.get("/pools/{pool_id}", response_model=Pool, tags=["Pools"])
async def get_pool(pool_id: str) -> Pool:
    """
    Retrieves details of a specific collateral pool.
    """
    return _get_pool_or_404(pool_id)

@app.post("/pools/{pool_id}/collaterals/", response_model=Pool, tags=["Collaterals"])
async def add_collateral_to_pool(pool_id: str, collateral: Collateral) -> Pool:
    """
    Adds a new collateral asset to an existing pool.
    If the asset already exists in the pool, its amount and value will be updated.
    """
    pool = _get_pool_or_404(pool_id)
    if not pool.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Pool '{pool_id}' is not active. Cannot add collateral."
        )

    existing_collateral_index = -1
    for i, c in enumerate(pool.collaterals):
        if c.asset_id == collateral.asset_id:
            existing_collateral_index = i
            break

    if existing_collateral_index != -1:
        # Update existing collateral
        pool.collaterals[existing_collateral_index].amount += collateral.amount
        pool.collaterals[existing_collateral_index].value_usd += collateral.value_usd # Simplistic update, real scenario might involve price oracles
    else:
        # Add new collateral
        pool.collaterals.append(collateral)

    pool.total_value_usd = _calculate_pool_value(pool)
    return pool

@app.get("/pools/{pool_id}/collaterals/", response_model=List[Collateral], tags=["Collaterals"])
async def get_collaterals_in_pool(pool_id: str) -> List[Collateral]:
    """
    Lists all collateral assets in a specific pool.
    """
    pool = _get_pool_or_404(pool_id)
    return pool.collaterals

@app.put("/pools/{pool_id}/status", response_model=Pool, tags=["Pools"])
async def update_pool_status(pool_id: str, is_active: bool) -> Pool:
    """
    Activates or deactivates a collateral pool.
    """
    pool = _get_pool_or_404(pool_id)
    pool.is_active = is_active
    return pool

@app.delete("/pools/{pool_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Pools"])
async def delete_pool(pool_id: str):
    """
    Deletes a collateral pool.
    """
    _get_pool_or_404(pool_id) # Ensure it exists before deleting
    del db[pool_id]
    return None

# A simple root endpoint for health check or info
@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to Python MCP FastAPI"}

if __name__ == "__main__":
    import uvicorn
    # This is for running locally, Uvicorn will be run by `poetry run uvicorn mcp_fastapi.main:app --reload`
    # from the `src/python/mcp` directory.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_dirs=["."])

# To make `app` discoverable by Uvicorn when running from `src/python/mcp` directory:
# `poetry run uvicorn mcp_fastapi.main:app --reload`
# The `pyproject.toml` should specify `packages = [{include = "mcp_fastapi", from = "."}]`
# and this `main.py` file is inside the `mcp_fastapi` directory.
# The current working directory for uvicorn should be `src/python/mcp`.
# The module path will be `mcp_fastapi.main`.
# The app instance is `app`.
# So, `mcp_fastapi.main:app`.
