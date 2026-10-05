# Next pass: Pass 12F / M6F durable season state, recovery and archive

Entry condition: retain the frozen Pass 12A schedule, Pass 12B/12C career state, Pass 12D canonical match completions and Pass 12E `LC_T20_SEASON_PROJECTION_V1` table/stat projection. Existing match persistence remains unchanged.

Bounded objective: persist the complete management season atomically, including schedule identity, career condition/training state, applied match completions, projection state and current management position. Autosave after accepted management commands and completed matches. Resume must not duplicate a fixture, fatigue delta, table update or player statistic. Export/import must preserve the season and rebuild/verify projections against canonical completion records.

Required gates: interrupted-write recovery, duplicate completion replay, projection rebuild equivalence, export/import hash identity, corrupt/missing completion rejection, resume before and after the managed team fixture, and a season snapshot that can advance after reload. Do not add tactical M7 AI, contracts/transfers, injuries, DLS or a second-year career.
