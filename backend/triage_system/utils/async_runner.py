"""Async execution helpers for concurrent worker agent runs."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable


async def run_parallel(tasks: dict[str, Awaitable]) -> dict[str, object]:
    """Run named awaitables concurrently and return keyed results."""
    names = list(tasks.keys())
    results = await asyncio.gather(*tasks.values(), return_exceptions=False)
    return dict(zip(names, results, strict=True))
