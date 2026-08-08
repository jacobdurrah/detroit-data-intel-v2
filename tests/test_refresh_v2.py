#!/usr/bin/env python3
"""Regression tests for refresh_v2 COLUMN_MAP / transform safety."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

# refresh_v2 requires SUPABASE_KEY at import time
os.environ.setdefault("SUPABASE_KEY", "test-key")

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import refresh_v2  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TransformCsvHeaderTests(unittest.TestCase):
    def test_rentals_trades_presale_match_live_title_case_headers(self):
        for name in ("rentals", "trades", "presale"):
            with self.subTest(name=name):
                with tempfile.TemporaryDirectory() as tmp:
                    out, cols = refresh_v2.transform_csv(
                        name, str(FIXTURES / f"{name}_headers.csv"), data_dir=tmp
                    )
                    self.assertIsNotNone(out, f"{name} transform should succeed")
                    pk = refresh_v2.PRIMARY_KEYS[name]
                    self.assertIn(pk, cols)
                    # All configured map keys should match the live Title Case export
                    self.assertEqual(len(cols), len(refresh_v2.COLUMN_MAPS[name]))

    def test_dlba_auction_maps_renamed_closing_date_and_price(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, cols = refresh_v2.transform_csv(
                "dlba_auction",
                str(FIXTURES / "dlba_auction_headers.csv"),
                data_dir=tmp,
            )
            self.assertIsNotNone(out)
            self.assertIn("sale_date", cols)
            self.assertIn("sale_price", cols)
            self.assertIn("longitude", cols)
            self.assertIn("latitude", cols)
            self.assertIn("object_id", cols)

    def test_snake_case_rentals_map_would_fail_closed(self):
        """Guard against regressing to snake_case keys that match 0 live headers."""
        original = refresh_v2.COLUMN_MAPS["rentals"]
        refresh_v2.COLUMN_MAPS["rentals"] = {
            "record_id": "certificate_number",
            "registration_type": "status",
            "address": "address",
            "parcel_id": "parcel_id",
            "neighborhood": "neighborhood",
            "council_district": "council_district",
            "zip_code": "zip_code",
            "longitude": "longitude",
            "latitude": "latitude",
        }
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out, cols = refresh_v2.transform_csv(
                    "rentals",
                    str(FIXTURES / "rentals_headers.csv"),
                    data_dir=tmp,
                )
                self.assertIsNone(out)
                self.assertEqual(cols, [])
        finally:
            refresh_v2.COLUMN_MAPS["rentals"] = original

    def test_partial_header_match_refuses_load(self):
        """Partial matches must not proceed to TRUNCATE+COPY."""
        original = refresh_v2.COLUMN_MAPS["dlba_auction"]
        # Simulate the pre-fix map: ObjectId/Address match, Sale Date/Price do not
        refresh_v2.COLUMN_MAPS["dlba_auction"] = {
            "ObjectId": "object_id",
            "Address": "address",
            "Parcel ID": "parcel_id",
            "Sale Date": "sale_date",
            "Sale Price": "sale_price",
            "Buyer": "buyer",
            "Neighborhood": "neighborhood",
            "Council District": "council_district",
            "Zip Code": "zip_code",
            "Longitude": "longitude",
            "Latitude": "latitude",
        }
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out, cols = refresh_v2.transform_csv(
                    "dlba_auction",
                    str(FIXTURES / "dlba_auction_headers.csv"),
                    data_dir=tmp,
                )
                self.assertIsNone(out)
                self.assertEqual(cols, [])
        finally:
            refresh_v2.COLUMN_MAPS["dlba_auction"] = original


if __name__ == "__main__":
    unittest.main()
