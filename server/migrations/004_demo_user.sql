-- Update demo user password to Demo123!
-- Hash generated with bcrypt (10 rounds)
UPDATE users
SET password_hash = '$2b$10$LS4PKlR5Grqa11GbLAGHYO.4gfhGrLB4n39fCNa/ovrCuJSzpbSfW'
WHERE email = 'demo@borrowhood.com';
