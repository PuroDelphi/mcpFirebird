import { readBlobField, resolveBlobFields, resolveNativeBlobFields } from '../../db/blob.js';

describe('Firebird BLOB resolution', () => {
    it('detects a BLOB when the first row contains NULL', async () => {
        const rows = await resolveBlobFields([
            { NAME: 'FIRST', DESCRIPTION: null },
            { NAME: 'SECOND', DESCRIPTION: Buffer.from('Description') }
        ]);

        expect(rows).toEqual([
            { NAME: 'FIRST', DESCRIPTION: null },
            { NAME: 'SECOND', DESCRIPTION: 'Description' }
        ]);
    });

    it('does not stringify an unresolved object containing connection details', async () => {
        await expect(readBlobField({ attachment: { password: 'secret' } }))
            .rejects.toThrow('Unresolved Firebird BLOB object');
    });

    it('reads native Blob objects while the transaction is active', async () => {
        const read = jest.fn()
            .mockImplementationOnce(async (buffer: Buffer) => {
                buffer.write('BEGIN');
                return 5;
            })
            .mockResolvedValueOnce(-1);
        const close = jest.fn().mockResolvedValue(undefined);
        const transaction = { active: true };
        const attachment = {
            openBlob: jest.fn().mockResolvedValue({ read, close })
        };
        const blob = { id: new Uint8Array(8), attachment };

        const rows = await resolveNativeBlobFields([
            { NAME: 'PROC', SOURCE: blob, DESCRIPTION: null }
        ], transaction);

        expect(attachment.openBlob).toHaveBeenCalledWith(transaction, blob);
        expect(close).toHaveBeenCalled();
        expect(rows).toEqual([{ NAME: 'PROC', SOURCE: 'BEGIN', DESCRIPTION: null }]);
        expect(JSON.stringify(rows)).not.toContain('attachment');
    });
});
