-- SPDX-License-Identifier: GPL-2.0-or-later
DROP TABLE map_rotations;
DROP TABLE casual_preset_versions;
DROP TABLE casual_presets;
DROP TABLE admin_commands;
DROP TYPE admin_command_kind;
ALTER TABLE rooms DROP COLUMN roster;
ALTER TABLE users DROP COLUMN is_moderator;
