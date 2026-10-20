-- Allow authorized prescription deletion by checking custom session setting
CREATE OR REPLACE FUNCTION "forbid_modification"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('healthhub.allow_prescription_deletion', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
