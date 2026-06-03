// Mock for react-native-quick-sqlite
// Provides open(), execute() with in-memory row storage for tests.

const rows = {};

const mockDb = {
  execute: jest.fn((sql, params) => {
    // Store inserts so loadEnrolledFaces() can read them back in tests
    if (sql.trim().toUpperCase().startsWith('INSERT INTO enrolled_faces')) {
      if (!rows.enrolled_faces) { rows.enrolled_faces = []; }
      rows.enrolled_faces.push({ id: rows.enrolled_faces.length + 1, embedding: params[0] });
    }
    return { rows: { _array: rows.enrolled_faces || [] }, rowsAffected: 1 };
  }),
  close: jest.fn(),
};

module.exports = {
  open: jest.fn(() => mockDb),
  __mockDb: mockDb,
  __rows: rows,
};
