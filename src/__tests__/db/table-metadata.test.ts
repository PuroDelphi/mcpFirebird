jest.mock('../../db/queries.js', () => ({
    executeQuery: jest.fn()
}));

import { executeQuery } from '../../db/queries.js';
import { getTableConstraints, getTableIndexes, getTableTriggers } from '../../db/table-metadata.js';

const mockedExecuteQuery = jest.mocked(executeQuery);

describe('table-scoped relational metadata', () => {
    beforeEach(() => jest.clearAllMocks());

    it('groups ordered index columns', async () => {
        mockedExecuteQuery.mockResolvedValue([
            { INDEX_NAME: ' IDX_CUSTOMER ', IS_UNIQUE: 1, INDEX_TYPE: 0, SEGMENT_COUNT: 2, FIELD_NAME: 'LAST_NAME' },
            { INDEX_NAME: ' IDX_CUSTOMER ', IS_UNIQUE: 1, INDEX_TYPE: 0, SEGMENT_COUNT: 2, FIELD_NAME: 'FIRST_NAME' }
        ]);

        await expect(getTableIndexes('customers')).resolves.toEqual({
            tableName: 'customers',
            indexes: [{
                name: 'IDX_CUSTOMER',
                isUnique: true,
                type: 'ASCENDING',
                segmentCount: 2,
                columns: ['LAST_NAME', 'FIRST_NAME']
            }]
        });
        expect(mockedExecuteQuery).toHaveBeenCalledWith(expect.any(String), ['CUSTOMERS']);
    });

    it('groups foreign-key columns and their referenced columns', async () => {
        mockedExecuteQuery.mockResolvedValue([
            {
                CONSTRAINT_NAME: ' FK_ORDER_CUSTOMER ', CONSTRAINT_TYPE: ' FOREIGN KEY ', INDEX_NAME: 'FK_ORDER_CUSTOMER',
                FIELD_NAME: 'CUSTOMER_ID', REFERENCED_TABLE_NAME: 'CUSTOMERS', REFERENCED_FIELD_NAME: 'ID'
            }
        ]);

        const result = await getTableConstraints('ORDERS');
        expect(result.constraints[0]).toEqual({
            name: 'FK_ORDER_CUSTOMER',
            type: 'FOREIGN KEY',
            indexName: 'FK_ORDER_CUSTOMER',
            columns: ['CUSTOMER_ID'],
            references: { table: 'CUSTOMERS', columns: ['ID'] }
        });
    });

    it('returns check source and table-specific trigger text', async () => {
        mockedExecuteQuery
            .mockResolvedValueOnce([{
                CONSTRAINT_NAME: 'CHK_AMOUNT', CONSTRAINT_TYPE: 'CHECK', CHECK_SOURCE: ' CHECK (AMOUNT > 0) '
            }])
            .mockResolvedValueOnce([{
                TRIGGER_NAME: 'ORDERS_BI', TRIGGER_TYPE: 1, TRIGGER_SEQUENCE: 0,
                IS_INACTIVE: 0, SOURCE: ' BEGIN NEW.ID = 1; END ', DESCRIPTION: ' Initializes ID '
            }]);

        const constraints = await getTableConstraints('ORDERS');
        const triggers = await getTableTriggers('ORDERS');

        expect(constraints.constraints[0].checkSource).toBe('CHECK (AMOUNT > 0)');
        expect(triggers.triggers[0]).toMatchObject({
            name: 'ORDERS_BI', source: 'BEGIN NEW.ID = 1; END', description: 'Initializes ID', isActive: true
        });
    });
});
