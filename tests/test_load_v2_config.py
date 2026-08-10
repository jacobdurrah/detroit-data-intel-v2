import importlib.util
from pathlib import Path
import unittest


def load_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "load_v2.py"
    spec = importlib.util.spec_from_file_location("load_v2", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LoadV2ConfigTest(unittest.TestCase):
    def test_rentals_owner_name_uses_owner_column(self):
        load_v2 = load_module()
        _, _, columns = load_v2.TABLES["rentals"]
        owner_mapping = [mapping for mapping in columns if mapping[1] == "owner_name"]

        self.assertEqual(owner_mapping, [("owner_name", "owner_name", "s")])


if __name__ == "__main__":
    unittest.main()
