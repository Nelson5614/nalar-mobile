import { fireEvent, render, screen } from '@testing-library/react-native';

import Library from '@/app/library/index';
import Reader from '@/app/library/read';

const mockGet = jest.fn();
const mockPush = jest.fn();
const mockOpenBrowser = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('@/lib/token-store', () => ({
  tokenStore: { get: () => Promise.resolve({ token: 'secret-token' }) },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

jest.mock('expo-screen-capture', () => ({ usePreventScreenCapture: jest.fn() }));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ product: 'prod1', asset: 'asset1', title: 'Lighting workbook' }),
  Stack: { Screen: () => null },
}));

const asset = (extra: object = {}) => ({
  id: 'asset1',
  kind: 'pdf',
  filename: 'workbook.pdf',
  size_bytes: 2048,
  readable: true,
  downloadable: false,
  ...extra,
});

const order = (extra: object = {}) => ({
  id: 'order1',
  status: 'paid',
  credits_spent: 120,
  created_at: '2026-11-02T10:00:00+00:00',
  seller: { id: 2, name: 'Sarah Creator' },
  product: { id: 'prod1', title: 'Lighting workbook', type: 'digital', cover_image_url: null },
  assets: [asset()],
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('<Library />', () => {
  test('lists what I bought, from whom, and lets me read a PDF', async () => {
    mockGet.mockResolvedValue({ data: [order()] });

    await render(<Library />);

    expect(await screen.findByText('Lighting workbook')).toBeTruthy();
    expect(screen.getByText('From Sarah Creator')).toBeTruthy();
    expect(screen.getByText('workbook.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download workbook.pdf' })).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/shop/library');

    await fireEvent.press(screen.getByRole('button', { name: 'Read workbook.pdf' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/library/read',
      params: { product: 'prod1', asset: 'asset1', title: 'Lighting workbook' },
    });
  });

  test('a downloadable file opens a fresh signed link in the browser', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: [order({ assets: [asset({ readable: false, kind: 'audio', filename: 'mix.mp3', downloadable: true })] })],
      })
      .mockResolvedValueOnce({ data: { url: 'https://nalar.test/dl?signature=abc' } });

    await render(<Library />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download mix.mp3' }));

    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/shop/products/prod1/assets/asset1/download-link');
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://nalar.test/dl?signature=abc');
  });

  test('a refunded order says so and offers nothing to open', async () => {
    mockGet.mockResolvedValue({ data: [order({ status: 'refunded', assets: [asset({ readable: false })] })] });

    await render(<Library />);

    expect(await screen.findByText('Refunded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read workbook.pdf' })).toBeNull();
  });

  test('a physical order shows where it is in delivery', async () => {
    mockGet.mockResolvedValue({
      data: [
        order({
          status: 'shipped',
          product: { id: 'p2', title: 'Signed poster', type: 'physical', cover_image_url: null },
          assets: [],
        }),
      ],
    });

    await render(<Library />);

    expect(await screen.findByText('Signed poster')).toBeTruthy();
    expect(screen.getByText('Shipped')).toBeTruthy();
  });

  test('nothing bought yet says so', async () => {
    mockGet.mockResolvedValue({ data: [] });

    await render(<Library />);

    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });
});

describe('<Reader />', () => {
  test('shows each watermarked page, fetched with my sign-in', async () => {
    mockGet.mockResolvedValue({ pages: 3 });

    await render(<Reader />);

    // The list draws pages as they scroll into view, so the count is checked
    // through the page label rather than by counting images.
    expect(await screen.findByText('1 of 3')).toBeTruthy();
    const pages = screen.getAllByTestId(/^reader-page-/);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/shop/products/prod1/assets/asset1/document');
    expect(pages[1].props.source).toEqual([
      expect.objectContaining({
        uri: expect.stringContaining('/api/v1/shop/products/prod1/assets/asset1/pages/2'),
        headers: { Authorization: 'Bearer secret-token' },
      }),
    ]);
  });
});
