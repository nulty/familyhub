# Database Schema

SQLite database stored in the browser's Origin Private File System (OPFS) via the SAH pool VFS. Schema defined in `public/schema.sql` (version 6).

See [migrations.md](migrations.md) for how schema changes are managed.

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

### person_names

Multiple names per person (married names, nicknames, etc.).

| Column     | Type    | Notes                                      |
|------------|---------|--------------------------------------------|
| id         | TEXT PK | ULID                                       |
| person_id  | TEXT FK | References `people(id)` ON DELETE CASCADE  |
| given_name | TEXT    | Default `''`                               |
| surname    | TEXT    | Default `''`                               |
| type       | TEXT    | `''`, `birth`, `married`, `nickname`, `legal`, `aka` |
| date       | TEXT    | When name was adopted                      |
| sort_order | INTEGER | Display ordering                           |
| created_at | INTEGER | Unix ms                                    |
| updated_at | INTEGER | Unix ms                                    |

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

| Column    | Type    | Notes                                            |
|-----------|---------|--------------------------------------------------|
| id        | TEXT PK | ULID                                             |
| person_id | TEXT FK | References `people(id)` ON DELETE CASCADE, nullable |
| type      | TEXT    | See event types below. Default `'other'`         |
| date      | TEXT    | Free text (e.g. `"3 SEP 1913"`, `"ABT 1890"`)   |
| place     | TEXT    | Free text                                        |
| place_id  | TEXT FK | References `places(id)` ON DELETE SET NULL       |
| notes     | TEXT    | Default `''`                                     |
| sort_date | INTEGER | Unix ms, computed from `date`, nullable          |
| created_at| INTEGER | Unix ms                                          |
| updated_at| INTEGER | Unix ms                                          |

`person_id` is nullable — shared events (e.g. marriages) have no single owner and use `event_participants` instead.

**Event types:** `birth`, `death`, `burial`, `residence`, `marriage`, `divorce`, `census`, `immigration`, `emigration`, `naturalisation`, `occupation`, `other`

### event_participants

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| event_id  | TEXT FK | References `events(id)` ON DELETE CASCADE   |
| person_id | TEXT FK | References `people(id)` ON DELETE CASCADE   |
| role      | TEXT    | Default `'witness'`                         |
| created_at| INTEGER | Unix ms                                     |

**Roles:** `father`, `mother`, `spouse`, `witness`, `godfather`, `godmother`, `informant`, `other`

Unique constraint on `(event_id, person_id)`.

### repositories

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| name      | TEXT    | Default `''`                                |
| type      | TEXT    | `''`, `archive`, `library`, `website`, `database`, `church`, `government`, `personal`, `other` |
| url       | TEXT    | Base URL for online repositories            |
| address   | TEXT    | Physical address                            |
| notes     | TEXT    | Default `''`                                |
| created_at| INTEGER | Unix ms                                     |
| updated_at| INTEGER | Unix ms                                     |

### sources

| Column       | Type    | Notes                                          |
|--------------|---------|-------------------------------------------------|
| id           | TEXT PK | ULID                                            |
| repository_id| TEXT FK | References `repositories(id)` ON DELETE SET NULL|
| title        | TEXT    | Default `''`                                    |
| type         | TEXT    | `''`, `document`, `register`, `census`, `webpage`, `book`, `newspaper`, `certificate`, `photograph`, `other` |
| url          | TEXT    | Source-level URL                                |
| author       | TEXT    | Default `''`                                    |
| publisher    | TEXT    | Default `''`                                    |
| year         | TEXT    | Default `''`                                    |
| notes        | TEXT    | Default `''`                                    |
| created_at   | INTEGER | Unix ms                                         |
| updated_at   | INTEGER | Unix ms                                         |

### citations

| Column     | Type    | Notes                                         |
|------------|---------|-----------------------------------------------|
| id         | TEXT PK | ULID                                          |
| source_id  | TEXT FK | References `sources(id)` ON DELETE CASCADE    |
| detail     | TEXT    | Page/entry/film number                        |
| url        | TEXT    | Direct URL to specific record                 |
| accessed   | TEXT    | Date accessed                                 |
| confidence | TEXT    | `''`, `primary`, `secondary`, `questionable`  |
| notes      | TEXT    | Default `''`                                  |
| created_at | INTEGER | Unix ms                                       |
| updated_at | INTEGER | Unix ms                                       |

### citation_events

Junction table linking citations to events (many-to-many).

| Column      | Type    | Notes                                         |
|-------------|---------|-----------------------------------------------|
| citation_id | TEXT FK | References `citations(id)` ON DELETE CASCADE  |
| event_id    | TEXT FK | References `events(id)` ON DELETE CASCADE     |

Composite primary key on `(citation_id, event_id)`.

### places

| Column    | Type    | Notes                                       |
|-----------|---------|---------------------------------------------|
| id        | TEXT PK | ULID                                        |
| name      | TEXT    | Default `''`                                |
| type      | TEXT    | See place types below                       |
| parent_id | TEXT FK | Self-referential, ON DELETE SET NULL         |
| notes     | TEXT    | Default `''`                                |
| created_at| INTEGER | Unix ms                                     |
| updated_at| INTEGER | Unix ms                                     |

**Place types:** `''`, `country`, `province`, `county`, `barony`, `civil_parish`, `church_parish`, `parish`, `townland`, `city`, `town`, `suburb`, `village`, `street`, `address`, `cemetery`

### meta

| Column | Type    | Notes                         |
|--------|---------|-------------------------------|
| key    | TEXT PK | e.g. `schema_version`         |
| value  | TEXT    | e.g. `6`                      |
