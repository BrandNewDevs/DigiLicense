"""Manage evaluation-only File Search resources for an already-promoted corpus release."""

import argparse
import asyncio
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from typing import cast

import httpx
from openai import AsyncOpenAI

from digilicense_ai.config import EnvironmentProfile, RetrievalBackend, Settings
from digilicense_ai.corpus import load_promoted_corpus
from digilicense_ai.retrieval.lifecycle import (
    EvaluationResourceManifest,
    FileSearchLifecycleClient,
    UploadedSection,
    delete_evaluation_corpus,
    inspect_uploaded_sections,
    require_matching_vector_store,
    upload_promoted_sections,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("upload", "inspect", "expire", "delete"))
    parser.add_argument("--resource-manifest", type=Path)
    parser.add_argument("--delete-vector-store", action="store_true")
    parser.add_argument("--confirm", action="store_true")
    return parser


def _settings() -> Settings:
    settings = Settings()
    if (
        settings.profile is not EnvironmentProfile.EVALUATION
        or settings.retrieval_backend is not RetrievalBackend.FILE_SEARCH
    ):
        raise RuntimeError("File Search lifecycle scripts require evaluation File Search settings")
    return settings


def _client(settings: Settings) -> FileSearchLifecycleClient:
    if settings.openai_api_key is None or settings.openai_project_id is None:
        raise RuntimeError("OpenAI settings were not validated")
    return cast(
        FileSearchLifecycleClient,
        AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            project=settings.openai_project_id,
            timeout=httpx.Timeout(
                settings.openai_request_timeout_seconds,
                connect=settings.openai_connect_timeout_seconds,
            ),
            max_retries=0,
        ),
    )


def _load_resource_manifest(path: Path) -> EvaluationResourceManifest:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return EvaluationResourceManifest(
            vector_store_id=payload["vector_store_id"],
            uploaded=tuple(UploadedSection(**item) for item in payload["uploaded"]),
        )
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise ValueError("resource manifest is invalid") from error


async def _run(args: argparse.Namespace) -> None:
    settings = _settings()
    vector_store_id = settings.file_search_vector_store_id
    if vector_store_id is None:
        raise RuntimeError("File Search settings were not validated")
    client = _client(settings)
    try:
        if args.command == "upload":
            uploaded = await upload_promoted_sections(
                client,
                corpus=load_promoted_corpus(),
                vector_store_id=vector_store_id,
                expires_after_days=settings.file_search_expiry_days,
            )
            resource_manifest = EvaluationResourceManifest(vector_store_id, uploaded)
            print(json.dumps(asdict(resource_manifest)))
            return
        if args.resource_manifest is None:
            raise RuntimeError("inspect, expire, and delete require --resource-manifest")
        resource_manifest = _load_resource_manifest(args.resource_manifest)
        require_matching_vector_store(resource_manifest, vector_store_id)
        if args.command == "inspect":
            completed = await inspect_uploaded_sections(
                client,
                vector_store_id=vector_store_id,
                uploaded=resource_manifest.uploaded,
            )
            print(json.dumps({"completed_file_ids": completed}))
            return
        if not args.confirm:
            raise RuntimeError("expiry and deletion require --confirm")
        await delete_evaluation_corpus(
            client,
            vector_store_id=vector_store_id,
            uploaded=resource_manifest.uploaded,
            delete_vector_store=args.delete_vector_store,
        )
        print(json.dumps({"deleted": True, "vector_store_deleted": args.delete_vector_store}))
    finally:
        await client.close()


def main(argv: Sequence[str] | None = None) -> None:
    asyncio.run(_run(_parser().parse_args(argv)))


if __name__ == "__main__":
    main()
