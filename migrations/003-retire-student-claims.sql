-- Retain previously submitted data without constraining administrator report management.
CREATE TABLE retired_student_claims AS SELECT * FROM claims;
DROP TABLE claims;
