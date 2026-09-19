import importlib.util
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_refresh_module():
    os.environ.setdefault("SUPABASE_KEY", "test-service-key")
    spec = importlib.util.spec_from_file_location(
        "refresh_v2", ROOT / "scripts" / "refresh_v2.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RefreshV2Tests(unittest.TestCase):
    def test_psql_load_wraps_truncate_and_copy_in_one_transaction(self):
        refresh_v2 = load_refresh_module()
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(kwargs["input"])
            return subprocess.CompletedProcess(args[0], 0, stdout="", stderr="")

        with patch.object(refresh_v2.subprocess, "run", side_effect=fake_run):
            ok = refresh_v2.load_table_psql(
                "sales", "/tmp/sales_transformed.csv", ["sales_id", "address"]
            )

        self.assertTrue(ok)
        sql = calls[0]
        self.assertIn("BEGIN;", sql)
        self.assertIn("TRUNCATE sales;", sql)
        self.assertIn("\\copy sales (sales_id, address)", sql)
        self.assertIn("COMMIT;", sql)
        self.assertLess(sql.index("BEGIN;"), sql.index("TRUNCATE sales;"))
        self.assertLess(sql.index("TRUNCATE sales;"), sql.index("\\copy sales"))
        self.assertLess(sql.index("\\copy sales"), sql.index("COMMIT;"))

    def test_sales_relink_restores_street_id_from_address_map(self):
        refresh_v2 = load_refresh_module()
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(kwargs["input"])
            return subprocess.CompletedProcess(args[0], 0, stdout=" linked_sales \n--------------\n       423000\n", stderr="")

        with patch.object(refresh_v2.subprocess, "run", side_effect=fake_run):
            ok = refresh_v2.relink_sales_street_ids()

        self.assertTrue(ok)
        sql = calls[0]
        self.assertIn("ALTER TABLE sales ADD COLUMN IF NOT EXISTS street_id INTEGER", sql)
        self.assertIn("UPDATE sales s", sql)
        self.assertIn("FROM address_street_map asm", sql)
        self.assertIn("CREATE INDEX IF NOT EXISTS idx_sales_street_id", sql)


if __name__ == "__main__":
    unittest.main()
