CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket CHAR(64) NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL,
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sponsors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(160) NOT NULL,
  name_norm VARCHAR(200) NOT NULL,
  name_key VARCHAR(200) NOT NULL,
  cin VARCHAR(20) NULL,
  cin_norm VARCHAR(20) NULL,
  phone VARCHAR(20) NULL,
  phone_norm VARCHAR(20) NULL,
  type ENUM('group', 'classic', 'special', 'sub') NOT NULL DEFAULT 'classic',
  parent_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sponsors_cin (cin_norm),
  KEY idx_sponsors_parent (parent_id),
  KEY idx_sponsors_name (name_norm),
  KEY idx_sponsors_key (name_key),
  KEY idx_sponsors_phone (phone_norm),
  CONSTRAINT fk_sponsors_parent FOREIGN KEY (parent_id) REFERENCES sponsors (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  name_norm VARCHAR(200) NOT NULL,
  name_key VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NULL,
  phone_norm VARCHAR(20) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendors_name (name_norm),
  KEY idx_vendors_key (name_key),
  KEY idx_vendors_phone (phone_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS families (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sponsor_id INT UNSIGNED NULL,
  phone VARCHAR(20) NULL,
  phone_norm VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_families_sponsor (sponsor_id),
  KEY idx_families_phone (phone_norm),
  KEY idx_families_created (created_at),
  CONSTRAINT fk_families_sponsor FOREIGN KEY (sponsor_id) REFERENCES sponsors (id) ON DELETE SET NULL,
  CONSTRAINT fk_families_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  family_id INT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  name_norm VARCHAR(200) NOT NULL,
  name_key VARCHAR(200) NOT NULL,
  cin VARCHAR(20) NULL,
  cin_norm VARCHAR(20) NULL,
  phone VARCHAR(20) NULL,
  phone_norm VARCHAR(20) NULL,
  is_representative TINYINT(1) NOT NULL DEFAULT 0,
  rep_key TINYINT GENERATED ALWAYS AS (IF(is_representative = 1, 1, NULL)) STORED,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_cin (cin_norm),
  UNIQUE KEY uq_members_one_rep (family_id, rep_key),
  KEY idx_members_family (family_id),
  KEY idx_members_name (name_norm),
  KEY idx_members_key (name_key),
  KEY idx_members_phone (phone_norm),
  CONSTRAINT fk_members_family FOREIGN KEY (family_id) REFERENCES families (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS distributions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  distribution_date DATE NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_distributions_date (distribution_date),
  CONSTRAINT fk_distributions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS distribution_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  distribution_id INT UNSIGNED NOT NULL,
  family_id INT UNSIGNED NULL,
  vendor_id INT UNSIGNED NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  family_name_snapshot VARCHAR(160) NOT NULL,
  family_cin_snapshot VARCHAR(20) NULL,
  family_phone_snapshot VARCHAR(20) NULL,
  sponsor_id_snapshot INT UNSIGNED NULL,
  sponsor_name_snapshot VARCHAR(160) NULL,
  vendor_name_snapshot VARCHAR(160) NOT NULL,
  members_count_snapshot INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assignment_family (family_id),
  KEY idx_assign_distribution (distribution_id),
  KEY idx_assign_vendor (vendor_id),
  KEY idx_assign_sponsor (sponsor_id_snapshot),
  CONSTRAINT fk_assign_distribution FOREIGN KEY (distribution_id) REFERENCES distributions (id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_family FOREIGN KEY (family_id) REFERENCES families (id) ON DELETE SET NULL,
  CONSTRAINT fk_assign_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(60) NULL,
  entity_id VARCHAR(40) NULL,
  details TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_action (action),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  filename VARCHAR(255) NOT NULL,
  mode ENUM('add','replace') NOT NULL DEFAULT 'add',
  status ENUM('validated','failed','imported','rejected') NOT NULL DEFAULT 'validated',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  error_count INT UNSIGNED NOT NULL DEFAULT 0,
  summary TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_import_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_errors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  row_num INT UNSIGNED NOT NULL,
  column_name VARCHAR(60) NOT NULL,
  original_value VARCHAR(255) NULL,
  message VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_import_errors_session (session_id),
  CONSTRAINT fk_import_errors_session FOREIGN KEY (session_id) REFERENCES import_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  operational_date DATE NOT NULL,
  execution_id CHAR(36) NOT NULL,
  status ENUM('running','success','partial','failed') NOT NULL DEFAULT 'running',
  sql_status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  excel_status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  sql_key VARCHAR(255) NULL,
  sql_size BIGINT UNSIGNED NULL,
  excel_key VARCHAR(255) NULL,
  excel_size BIGINT UNSIGNED NULL,
  error_message VARCHAR(500) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  lock_key DATE GENERATED ALWAYS AS (IF(status IN ('running','success'), operational_date, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_backup_execution (execution_id),
  UNIQUE KEY uq_backup_lock (lock_key),
  KEY idx_backup_date (operational_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
