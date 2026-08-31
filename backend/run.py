import argparse
import os
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Run the Canvenient desktop backend.")
    parser.add_argument("--data-dir", type=Path, default=Path.cwd())
    parser.add_argument("--port", type=int, default=8000)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    database_path = (args.data_dir / "canvenient.db").resolve()
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"

    import uvicorn
    from main import app

    uvicorn.run(app, host="127.0.0.1", port=args.port, reload=False)
