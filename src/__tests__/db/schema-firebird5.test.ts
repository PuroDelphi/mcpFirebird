jest.mock('../../db/queries.js', () => ({
    executeQuery: jest.fn()
}));

jest.mock('../../db/connection.js', () => ({
    DEFAULT_CONFIG: {}
}));

import { executeQuery } from '../../db/queries.js';
import { getTableSchema } from '../../db/schema.js';

const mockedExecuteQuery = jest.mocked(executeQuery);

describe('Firebird 5 schema compatibility', () => {
    it('does not use POSITION as a column alias', async () => {
        mockedExecuteQuery
            .mockResolvedValueOnce([{
                FIELD_NAME: 'ID',
                FIELD_TYPE: 'INTEGER',
                NULLABLE: 0,
                DEFAULT_VALUE: null,
                FIELD_POSITION: 0
            }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const schema = await getTableSchema('ACCOUNT');
        const columnsSql = mockedExecuteQuery.mock.calls[0][0];

        expect(columnsSql).toContain('AS field_position');
        expect(columnsSql).not.toMatch(/AS\s+position\b/i);
        expect(schema.columns[0].position).toBe(0);
    });
});
