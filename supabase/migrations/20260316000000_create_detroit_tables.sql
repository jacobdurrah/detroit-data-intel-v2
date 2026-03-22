
-- Detroit Open Data Tables
-- Auto-generated for bulk load

CREATE TABLE IF NOT EXISTS "public"."sales" (
  "sales_id" BIGINT PRIMARY KEY,
  "parcel_id" TEXT,
  "address" TEXT,
  "sale_date" DATE,
  "sale_price" NUMERIC,
  "grantor" TEXT,
  "grantee" TEXT,
  "terms_of_sale" TEXT,
  "sale_verification" TEXT,
  "sale_instrument" TEXT,
  "sale_number" INTEGER,
  "transfer_pct" NUMERIC,
  "multi_parcel" BOOLEAN,
  "property_class_code" TEXT,
  "property_class_desc" TEXT,
  "ecf_neighborhood" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."permits" (
  "permit_no" TEXT PRIMARY KEY,
  "address" TEXT,
  "permit_issued" DATE,
  "permit_expires" DATE,
  "permit_status" TEXT,
  "permit_type" TEXT,
  "bld_type_use" TEXT,
  "residential" TEXT,
  "description" TEXT,
  "contractor_name" TEXT,
  "contractor_type" TEXT,
  "estimated_cost" NUMERIC,
  "parcel_id" TEXT,
  "legal_use" TEXT,
  "floor_area" NUMERIC,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."blight" (
  "ticket_id" BIGINT PRIMARY KEY,
  "agency_name" TEXT,
  "inspector_name" TEXT,
  "violator_name" TEXT,
  "street_number" TEXT,
  "street_name" TEXT,
  "zip_code" TEXT,
  "violation_date" TIMESTAMPTZ,
  "ticket_issued_date" TIMESTAMPTZ,
  "hearing_date" TIMESTAMPTZ,
  "violation_code" TEXT,
  "violation_description" TEXT,
  "disposition" TEXT,
  "fine_amount" NUMERIC,
  "judgment_amount" NUMERIC,
  "balance_due" NUMERIC,
  "payment_status" TEXT,
  "compliance_status" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "latitude" NUMERIC,
  "longitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."assessment" (
  "parcel_id" TEXT PRIMARY KEY,
  "address" TEXT,
  "property_class" TEXT,
  "tax_status" TEXT,
  "total_assessed_value" NUMERIC,
  "total_taxable_value" NUMERIC,
  "land_value" NUMERIC,
  "improvement_value" NUMERIC,
  "neighborhood" TEXT,
  "year_built" INTEGER,
  "bldg_class" TEXT,
  "total_floor_area" NUMERIC,
  "floors" NUMERIC,
  "bedrooms" INTEGER,
  "full_baths" INTEGER,
  "half_baths" INTEGER,
  "ext_wall" TEXT,
  "heat_type" TEXT,
  "heating" TEXT,
  "last_sale_date" DATE,
  "last_sale_price" NUMERIC,
  "owner_name" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "council_district" TEXT,
  "zip_code" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."demos" (
  "permit_no" TEXT PRIMARY KEY,
  "address" TEXT,
  "permit_issued" DATE,
  "permit_status" TEXT,
  "bld_type_use" TEXT,
  "parcel_id" TEXT,
  "contractor_name" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."rentals" (
  "certificate_number" TEXT PRIMARY KEY,
  "status" TEXT,
  "address" TEXT,
  "parcel_id" TEXT,
  "rental_type" TEXT,
  "num_units" INTEGER,
  "owner_name" TEXT,
  "manager_name" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."presale" (
  "case_id" TEXT PRIMARY KEY,
  "address" TEXT,
  "status" TEXT,
  "rating" TEXT,
  "parcel_id" TEXT,
  "case_type" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."vacant" (
  "task_id" TEXT PRIMARY KEY,
  "address" TEXT,
  "date_issued" DATE,
  "owner_name" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "parcel_id" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."dlba_auction" (
  "object_id" INTEGER PRIMARY KEY,
  "address" TEXT,
  "parcel_id" TEXT,
  "sale_date" DATE,
  "sale_price" NUMERIC,
  "buyer" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."dlba_owned" (
  "parcel_id" TEXT PRIMARY KEY,
  "address" TEXT,
  "council_district" TEXT,
  "zip_code" TEXT,
  "neighborhood" TEXT,
  "property_class" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."trades" (
  "permit_no" TEXT PRIMARY KEY,
  "address" TEXT,
  "permit_issued" DATE,
  "permit_status" TEXT,
  "permit_type" TEXT,
  "description" TEXT,
  "contractor_name" TEXT,
  "estimated_cost" NUMERIC,
  "parcel_id" TEXT,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."crime" (
  "crime_id" BIGINT,
  "year" INTEGER,
  "report_number" TEXT,
  "address" TEXT,
  "offense_description" TEXT,
  "offense_category" TEXT,
  "incident_timestamp" TIMESTAMPTZ,
  "neighborhood" TEXT,
  "council_district" TEXT,
  "longitude" NUMERIC,
  "latitude" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("crime_id", "year")
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sales_neighborhood ON sales(neighborhood);
CREATE INDEX IF NOT EXISTS idx_sales_grantee ON sales(grantee);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_parcel ON sales(parcel_id);
CREATE INDEX IF NOT EXISTS idx_assessment_neighborhood ON assessment(neighborhood);
CREATE INDEX IF NOT EXISTS idx_assessment_value ON assessment(total_assessed_value);
CREATE INDEX IF NOT EXISTS idx_blight_neighborhood ON blight(neighborhood);
CREATE INDEX IF NOT EXISTS idx_permits_neighborhood ON permits(neighborhood);
CREATE INDEX IF NOT EXISTS idx_permits_parcel ON permits(parcel_id);
CREATE INDEX IF NOT EXISTS idx_crime_neighborhood ON crime(neighborhood);
CREATE INDEX IF NOT EXISTS idx_rentals_owner ON rentals(owner_name);
CREATE INDEX IF NOT EXISTS idx_dlba_auction_buyer ON dlba_auction(buyer);

-- Enable RLS but allow service role full access
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE blight ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacant ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlba_auction ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlba_owned ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE crime ENABLE ROW LEVEL SECURITY;

-- Allow anon read access for the web app
DO $$ 
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['sales','permits','blight','assessment','demos','rentals','presale','vacant','dlba_auction','dlba_owned','trades','crime'])
  LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "anon_read_%s" ON %I FOR SELECT TO anon USING (true)', t, t);
  END LOOP;
END $$;
