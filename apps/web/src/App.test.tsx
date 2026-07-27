import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('shows the product and current milestone', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'HotelCut' })).toBeInTheDocument();
    expect(screen.getByText('M0 foundation')).toBeInTheDocument();
  });
});
