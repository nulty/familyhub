# Database Schema

SQLite database stored in the browser's Origin Private File System (OPFS) via the SAH pool VFS. Schema defined in `public/schema.sql`.

## Tables

### people

| Column     | Type    | Notes                          |
|------------|---------|--------------------------------|
| id         | TEXT PK | ULID                           |
| given_name | TEXT    | Default `''`                   |
| surname    | TEXT    | Default `''`                   |
| gender     | TEXT    | `M`, `F`, or `U` (unknown)    |
| notes      | TEXT    | Default `''`                   |
| created_at | INTEGER | Unix ms                        |
| updated_at | INTEGER | Unix ms                        |

### relationships

| Column      | Type    | Notes                                          |
|-------------|---------|------------------------------------------------|
| id          | TEXT PK | ULID                                           |
| person_a_id | TEXT FK | References `people(id)` ON DELETE CASCADE      |
| person_b_id | TEXT FK | References `people(id)` ON DELETE CASCADE      |
| type        | TEXT    | `partner` or `parent_child`                    |
| created_at  | INTEGER | Unix ms                                        |

- For `parent_child`: `person_a` = parent, `person_b` = child
- For `partner`: order doesn't matter
- Unique constraint on `(person_a_id, person_b_id, type)`

### events

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| person_id | TEXT FK | References `people(id)` ON DELETE CASCADE   |
| type      | TEXT    | See event types below. Default `'other'`    |
| date      | TEXT    | Free text (e.g. `"3 SEP 1913"`, `"ABT 1890"`) |
| place     | TEXT    | Free text                                   |
| notes     | TEXT    | Default `''`                                |
| sort_date | INTEGER | Unix ms, computed from `date`, nullable     |
| created_at| INTEGER | Unix ms                                     |
| updated_at| INTEGER | Unix ms                                     |

**Event types:** `birth`, `death`, `burial`, `residence`, `marriage`, `divorce`, `census`, `immigration`, `emigration`, `naturalisation`, `occupation`, `other`

### event_participants

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| event_id  | TEXT FK | References `events(id)` ON DELETE CASCADE   |
| person_id | TEXT FK | References `people(id)` ON DELETE CASCADE   |
| role      | TEXT    | Default `'witness'`                         |
| created_at| INTEGER | Unix ms                                     |

**Roles:** `father`, `mother`, `witness`, `godfather`, `godmother`, `informant`, `other`

Unique constraint on `(event_id, person_id)`.

### sources

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| event_id  | TEXT FK | References `events(id)` ON DELETE CASCADE   |
| title     | TEXT    | Default `''`                                |
| url       | TEXT    | Default `''`                                |
| accessed  | TEXT    | Default `''`                                |
| notes     | TEXT    | Default `''`                                |
| created_at| INTEGER | Unix ms                                     |
| updated_at| INTEGER | Unix ms                                     |

### meta

| Column | Type    | Notes                    |
|--------|---------|--------------------------|
| key    | TEXT PK | e.g. `schema_version`    |
| value  | TEXT    | e.g. `1`                 |
