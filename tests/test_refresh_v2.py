import csv
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_refresh_module():
    os.environ.setdefault("SUPABASE_KEY", "test-service-key")
    spec = importlib.util.spec_from_file_location(
        "refresh_v2_under_test", ROOT / "scripts" / "refresh_v2.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RefreshV2Tests(unittest.TestCase):
    def test_blight_transform_preserves_date_for_block_consumers(self):
        refresh_v2 = load_refresh_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "blight.csv"
            with source.open("w", newline="", encoding="utf-8") as csv_file:
                writer = csv.writer(csv_file)
                writer.writerow(["Ticket ID", "Ticket Issued Date", "Street Name"])
                writer.writerow(["123", "2026-07-01T12:00:00Z", "WOODWARD"])

            transformed, columns = refresh_v2.transform_csv(
                "blight", str(source), tmpdir
            )

            self.assertIn("violation_date", columns)
            self.assertIn("ticket_issued_date", columns)
            with open(transformed, newline="", encoding="utf-8") as csv_file:
                row = next(csv.DictReader(csv_file))

            self.assertEqual(row["violation_date"], "2026-07-01T12:00:00Z")
            self.assertEqual(
                row["ticket_issued_date"], "2026-07-01T12:00:00Z"
            )

    def test_sales_replace_and_relink_are_atomic(self):
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
        statements = [
            "BEGIN;",
            "TRUNCATE sales;",
            "\\copy sales (sales_id, address)",
            "UPDATE sales s",
            "CREATE INDEX IF NOT EXISTS idx_sales_street_id",
            "COMMIT;",
        ]
        for statement in statements:
            self.assertIn(statement, sql)
        for before, after in zip(statements, statements[1:]):
            self.assertLess(sql.index(before), sql.index(after))
        self.assertIn("FROM address_street_map asm", sql)
        self.assertIn("RAISE EXCEPTION 'sales refresh produced no street_id links'", sql)

    def test_copy_failure_is_reported_without_a_nontransactional_truncate(self):
        refresh_v2 = load_refresh_module()
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(kwargs["input"])
            return subprocess.CompletedProcess(
                args[0], 1, stdout="", stderr="invalid input syntax"
            )

        with patch.object(refresh_v2.subprocess, "run", side_effect=fake_run):
            ok = refresh_v2.load_table_psql(
                "blight", "/tmp/blight_transformed.csv", ["ticket_id"]
            )

        self.assertFalse(ok)
        sql = calls[0]
        self.assertLess(sql.index("BEGIN;"), sql.index("TRUNCATE blight;"))
        self.assertLess(sql.index("TRUNCATE blight;"), sql.index("\\copy blight"))
        self.assertLess(sql.index("\\copy blight"), sql.index("COMMIT;"))


if __name__ == "__main__":
    unittest.main()
