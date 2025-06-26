import pytest
from httpx import AsyncClient
from fastapi import status

# Import the FastAPI app instance.
# Assuming the tests are run from the `src/python/mcp` directory,
# and `mcp_fastapi` is in the PYTHONPATH (handled by poetry)
from mcp_fastapi.main import app, db as app_db  # Import db for cleanup

# Use a base URL for the test client
BASE_URL = "http://test"


@pytest.fixture(autouse=True)
async def clear_db_before_each_test():
    """Fixture to clear the in-memory database before each test."""
    app_db.clear()
    yield # Test runs here
    app_db.clear() # Cleanup after test

@pytest.mark.asyncio
async def test_read_root():
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        response = await ac.get("/")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"message": "Welcome to Python MCP FastAPI"}

@pytest.mark.asyncio
async def test_create_pool():
    pool_id = "test_pool_01"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        response = await ac.post(f"/pools/?pool_id={pool_id}")

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["pool_id"] == pool_id
    assert data["collaterals"] == []
    assert data["total_value_usd"] == 0.0
    assert data["is_active"] is True
    assert pool_id in app_db # Check if it's actually in our mock db

@pytest.mark.asyncio
async def test_create_pool_already_exists():
    pool_id = "test_pool_02"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        # Create it once
        await ac.post(f"/pools/?pool_id={pool_id}")
        # Try to create it again
        response = await ac.post(f"/pools/?pool_id={pool_id}")

    assert response.status_code == status.HTTP_409_CONFLICT
    assert f"Pool '{pool_id}' already exists" in response.json()["detail"]

@pytest.mark.asyncio
async def test_get_pool():
    pool_id = "test_pool_03"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        # First, create the pool
        await ac.post(f"/pools/?pool_id={pool_id}")
        # Then, get it
        response = await ac.get(f"/pools/{pool_id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["pool_id"] == pool_id

@pytest.mark.asyncio
async def test_get_pool_not_found():
    pool_id = "non_existent_pool"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        response = await ac.get(f"/pools/{pool_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert f"Pool '{pool_id}' not found" in response.json()["detail"]

@pytest.mark.asyncio
async def test_add_collateral_to_pool():
    pool_id = "pool_for_collateral"
    collateral_data = {"asset_id": "ETH", "amount": 10.5, "value_usd": 30000.75}

    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        # Create pool
        await ac.post(f"/pools/?pool_id={pool_id}")

        # Add collateral
        response = await ac.post(f"/pools/{pool_id}/collaterals/", json=collateral_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["pool_id"] == pool_id
    assert len(data["collaterals"]) == 1
    added_collateral = data["collaterals"][0]
    assert added_collateral["asset_id"] == collateral_data["asset_id"]
    assert added_collateral["amount"] == collateral_data["amount"]
    assert added_collateral["value_usd"] == collateral_data["value_usd"]
    assert data["total_value_usd"] == collateral_data["value_usd"]

@pytest.mark.asyncio
async def test_add_collateral_to_non_existent_pool():
    pool_id = "ghost_pool"
    collateral_data = {"asset_id": "BTC", "amount": 1.0, "value_usd": 50000.00}
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        response = await ac.post(f"/pools/{pool_id}/collaterals/", json=collateral_data)

    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.asyncio
async def test_add_collateral_to_inactive_pool():
    pool_id = "inactive_pool"
    collateral_data = {"asset_id": "SOL", "amount": 100.0, "value_usd": 15000.00}
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        # Create pool and make it inactive
        await ac.post(f"/pools/?pool_id={pool_id}")
        await ac.put(f"/pools/{pool_id}/status?is_active=false")

        # Try to add collateral
        response = await ac.post(f"/pools/{pool_id}/collaterals/", json=collateral_data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert f"Pool '{pool_id}' is not active" in response.json()["detail"]

@pytest.mark.asyncio
async def test_update_existing_collateral_in_pool():
    pool_id = "pool_update_collateral"
    initial_collateral = {"asset_id": "ADA", "amount": 1000, "value_usd": 500}
    additional_collateral = {"asset_id": "ADA", "amount": 500, "value_usd": 250}

    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        await ac.post(f"/pools/?pool_id={pool_id}")
        await ac.post(f"/pools/{pool_id}/collaterals/", json=initial_collateral)
        response = await ac.post(f"/pools/{pool_id}/collaterals/", json=additional_collateral)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["collaterals"]) == 1
    updated_collateral = data["collaterals"][0]
    assert updated_collateral["asset_id"] == "ADA"
    assert updated_collateral["amount"] == initial_collateral["amount"] + additional_collateral["amount"]
    assert updated_collateral["value_usd"] == initial_collateral["value_usd"] + additional_collateral["value_usd"]
    assert data["total_value_usd"] == initial_collateral["value_usd"] + additional_collateral["value_usd"]

@pytest.mark.asyncio
async def test_get_collaterals_in_pool():
    pool_id = "pool_with_items"
    collateral1 = {"asset_id": "DOT", "amount": 50, "value_usd": 350}
    collateral2 = {"asset_id": "LINK", "amount": 100, "value_usd": 1500}

    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        await ac.post(f"/pools/?pool_id={pool_id}")
        await ac.post(f"/pools/{pool_id}/collaterals/", json=collateral1)
        await ac.post(f"/pools/{pool_id}/collaterals/", json=collateral2)

        response = await ac.get(f"/pools/{pool_id}/collaterals/")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    # Check if both assets are present (order might vary)
    asset_ids_in_response = {c["asset_id"] for c in data}
    assert collateral1["asset_id"] in asset_ids_in_response
    assert collateral2["asset_id"] in asset_ids_in_response

@pytest.mark.asyncio
async def test_get_collaterals_in_empty_pool():
    pool_id = "empty_collateral_pool"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        await ac.post(f"/pools/?pool_id={pool_id}")
        response = await ac.get(f"/pools/{pool_id}/collaterals/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []

@pytest.mark.asyncio
async def test_update_pool_status():
    pool_id = "status_pool"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        await ac.post(f"/pools/?pool_id={pool_id}")

        # Deactivate
        response_deactivate = await ac.put(f"/pools/{pool_id}/status?is_active=false")
        assert response_deactivate.status_code == status.HTTP_200_OK
        assert response_deactivate.json()["is_active"] is False

        # Activate
        response_activate = await ac.put(f"/pools/{pool_id}/status?is_active=true")
        assert response_activate.status_code == status.HTTP_200_OK
        assert response_activate.json()["is_active"] is True

@pytest.mark.asyncio
async def test_delete_pool():
    pool_id = "delete_me_pool"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        await ac.post(f"/pools/?pool_id={pool_id}")

        # Delete
        response = await ac.delete(f"/pools/{pool_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's gone
        response_get = await ac.get(f"/pools/{pool_id}")
        assert response_get.status_code == status.HTTP_404_NOT_FOUND
        assert pool_id not in app_db

@pytest.mark.asyncio
async def test_delete_non_existent_pool():
    pool_id = "never_existed_pool"
    async with AsyncClient(app=app, base_url=BASE_URL) as ac:
        response = await ac.delete(f"/pools/{pool_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND

# Example of a test for Pydantic model validation (though FastAPI handles much of this)
def test_collateral_model_positive_amount():
    from mcp_fastapi.main import Collateral
    with pytest.raises(ValueError): # Pydantic uses ValueError for validation errors
        Collateral(asset_id="Test", amount=-10, value_usd=100)
    with pytest.raises(ValueError):
        Collateral(asset_id="Test", amount=10, value_usd=-100)
    # Valid case
    coll = Collateral(asset_id="Test", amount=10, value_usd=100)
    assert coll.amount == 10

# Note: More specific unit tests for internal logic (like _calculate_pool_value)
# could be added if that logic becomes more complex.
# For now, its behavior is implicitly tested via the endpoint tests.
