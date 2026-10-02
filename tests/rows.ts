import type { Row, VariableRow } from '../src/core/editor';

export const isVariableRow = (row: Row): row is VariableRow => !('character' in row);
