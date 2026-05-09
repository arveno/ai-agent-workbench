/// <reference types="node" />

import type { QueryResultRow } from 'pg';
import { createPostgresPool, getConnectionStringByProvider } from '../datasources/connection';
import type { ServerToolDefinition } from './types';

export interface SchemaInspectInput {
  includeColumns?: boolean;
}

export interface SchemaInspectOutput {
  schemas: string[];
  tableCount: number;
  tables: {
    schema: string;
    tableName: string;
    columns: {
      columnName: string;
      dataType: string;
      isNullable: boolean;
      ordinalPosition: number;
    }[];
  }[];
}

interface InformationSchemaRow extends QueryResultRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO' | string;
  ordinal_position: number;
}

function buildSchemaOutput(rows: InformationSchemaRow[], includeColumns: boolean): SchemaInspectOutput {
  const tableMap = new Map<string, SchemaInspectOutput['tables'][number]>();

  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    const existingTable = tableMap.get(key);

    if (!existingTable) {
      tableMap.set(key, {
        schema: row.table_schema,
        tableName: row.table_name,
        columns: includeColumns
          ? [
              {
                columnName: row.column_name,
                dataType: row.data_type,
                isNullable: row.is_nullable === 'YES',
                ordinalPosition: Number(row.ordinal_position),
              },
            ]
          : [],
      });
      continue;
    }

    if (includeColumns) {
      existingTable.columns.push({
        columnName: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === 'YES',
        ordinalPosition: Number(row.ordinal_position),
      });
    }
  }

  const tables = Array.from(tableMap.values());
  const schemas = Array.from(new Set(tables.map((table) => table.schema)));

  return {
    schemas,
    tableCount: tables.length,
    tables,
  };
}

export const schemaInspectTool: ServerToolDefinition<SchemaInspectInput, SchemaInspectOutput> = {
  id: 'schema_inspect',
  name: 'schema_inspect',
  description: '读取允许访问的数据源 Schema、表、字段和字段类型。',
  riskLevel: 'low',
  enabled: true,
  async execute(input, context) {
    const connectionString = getConnectionStringByProvider(context.provider);

    if (!connectionString) {
      throw new Error('未配置服务端连接环境变量');
    }

    const includeColumns = input.includeColumns ?? true;
    const pool = createPostgresPool({
      provider: context.provider,
      connectionString,
    });

    try {
      const result = await pool.query<InformationSchemaRow>({
        text: `
          select
            c.table_schema,
            c.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.ordinal_position
          from information_schema.columns c
          join information_schema.tables t
            on t.table_schema = c.table_schema
           and t.table_name = c.table_name
          where c.table_schema = 'public'
            and t.table_type = 'BASE TABLE'
          order by
            c.table_schema,
            c.table_name,
            c.ordinal_position
        `,
      });

      return buildSchemaOutput(result.rows, includeColumns);
    } finally {
      await pool.end().catch(() => undefined);
    }
  },
};
