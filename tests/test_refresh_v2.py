import csv
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REFRESH_PATH = REPO_ROOT / "scripts" / "refresh_v2.py"


def load_refresh_module():
    os.environ.setdefault("SUPABASE_KEY", "test-service-key")
    spec = importlib.util.spec_from_file_location("refresh_v2_under_test", REFRESH_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RefreshV2Tests(unittest.TestCase):
    def test_blight_transform_populates_ticket_issued_date(self):
        refresh_v2 = load_refresh_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            source_path = os.path.join(tmpdir, "blight.csv")
            with open(source_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Ticket ID", "Ticket Issued Date", "Street Name"])
                writer.writerow(["123", "2026-07-01T12:00:00Z", "WOODWARD"])

            transformed_path, columns = refresh_v2.transform_csv("blight", source_path, tmpdir)

            self.assertIn("violation_date", columns)
            self.assertIn("ticket_issued_date", columns)

            with open(transformed_path, newline="", encoding="utf-8") as f:
                row = next(csv.DictReader(f))

            self.assertEqual(row["violation_date"], "2026-07-01T12:00:00Z")
            self.assertEqual(row["ticket_issued_date"], "2026-07-01T12:00:00Z")

    def test_psql_load_wraps_truncate_and_copy_in_transaction(self):
        refresh_v2 = load_refresh_module()
        calls = []

        class Completed:
            returncode = 0
            stderr = ""
            stdout = ""

        def fake_run(args, input=None, capture_output=None, text=None, timeout=None):
            calls.append({
                "args": args,
                "input": input,
                "capture_output": capture_output,
                "text": text,
                "timeout": timeout,
            })
            return Completed()

        refresh_v2.subprocess.run = fake_run

        ok = refresh_v2.load_table_psql("sales", "/tmp/sales_transformed.csv", ["sales_id", "address"])

        self.assertTrue(ok)
        self.assertEqual(len(calls), 1)
        sql = calls[0]["input"]
        self.assertIn("BEGIN;", sql)
        self.assertIn("TRUNCATE sales;", sql)
        self.assertIn("\\copy sales (sales_id, address)", sql)
        self.assertIn("COMMIT;", sql)
        self.assertLess(sql.index("BEGIN;"), sql.index("TRUNCATE sales;"))
        self.assertLess(sql.index("TRUNCATE sales;"), sql.index("\\copy sales"))
        self.assertLess(sql.index("\\copy sales"), sql.index("COMMIT;"))


if __name__ == "__main__":
    unittest.main()
