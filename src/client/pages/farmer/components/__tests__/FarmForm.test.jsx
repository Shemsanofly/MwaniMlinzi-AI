import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { metaApi, locationApi } from '../../../../api/endpoints.js';
import FarmForm from '../FarmForm.jsx';
import { renderPage, FARM } from '../../__tests__/fixtures.jsx';

vi.mock('../../../../api/endpoints.js', () => ({ metaApi: { species: vi.fn() }, locationApi: { reverse: vi.fn() } }));
vi.mock('../../../../stores/AuthContext.jsx', () => ({ useAuth: () => ({ memberships: [] }) }));
vi.mock('../../../../components/map/LocationPicker.jsx', () => ({ default: ({ onPick }) => <button type="button" onClick={() => onPick(-6.267, 39.534)}>Choose Paje on map</button> }));
const found = { status: 'FOUND', location: { locationName: 'Paje', district: 'Kusini', region: 'Zanzibar South and Central' } };
const renderForm = (farm) => renderPage(<FarmForm farm={farm} onSubmit={vi.fn()} submitLabel="Save farm" />);
const setPoint = (lat = '-6.267', lng = '39.534') => {
  fireEvent.change(screen.getByLabelText(/Latitude/), { target: { value: lat } });
  fireEvent.change(screen.getByLabelText(/Longitude/), { target: { value: lng } });
};

beforeEach(() => { vi.clearAllMocks(); metaApi.species.mockResolvedValue({ species: [] }); locationApi.reverse.mockResolvedValue(found); });
afterEach(() => vi.unstubAllGlobals());

it('fills place name, district and region automatically from device coordinates', async () => {
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: vi.fn((success) => success({ coords: { latitude: -6.267, longitude: 39.534 } })) } });
  const user = userEvent.setup();
  renderForm();
  await user.click(screen.getByRole('button', { name: 'Use my location' }));
  await waitFor(() => expect(locationApi.reverse).toHaveBeenCalledWith(-6.267, 39.534, 'en'));
  expect(await screen.findByDisplayValue('Paje')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Kusini')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Zanzibar South and Central')).toBeInTheDocument();
});

it('also resolves manually entered coordinates and map selections', async () => {
  const user = userEvent.setup();
  renderForm(); setPoint();
  expect(await screen.findByDisplayValue('Paje')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Pick on the map' }));
  await user.click(screen.getByRole('button', { name: 'Choose Paje on map' }));
  await waitFor(() => expect(locationApi.reverse).toHaveBeenCalledTimes(2));
});

it('keeps saved location names when an existing farm form is opened', async () => {
  renderForm({ ...FARM, location: { latitude: -6.267, longitude: 39.534, locationName: 'Recorded farm place', district: 'Kusini', region: 'Zanzibar' } });
  expect(screen.getByDisplayValue('Recorded farm place')).toBeInTheDocument();
  expect(locationApi.reverse).not.toHaveBeenCalled();
});

it('leaves unknown places blank and editable instead of creating a fallback name', async () => {
  locationApi.reverse.mockRejectedValue(new Error('Network unavailable'));
  renderForm(); setPoint();
  expect(await screen.findByText(/Could not identify a place/)).toBeInTheDocument();
  expect(document.getElementById('ff-loc')).toHaveValue('');
  fireEvent.change(document.getElementById('ff-loc'), { target: { value: 'Farmer entered place' } });
  expect(document.getElementById('ff-loc')).toHaveValue('Farmer entered place');
});

it('does not overwrite a farmer correction while a lookup is pending', async () => {
  let resolve;
  locationApi.reverse.mockReturnValue(new Promise((done) => { resolve = done; }));
  renderForm(); setPoint();
  await waitFor(() => expect(locationApi.reverse).toHaveBeenCalledTimes(1));
  fireEvent.change(document.getElementById('ff-loc'), { target: { value: 'My specific landing place' } });
  resolve(found);
  await screen.findByText(/Place name filled/);
  expect(document.getElementById('ff-loc')).toHaveValue('My specific landing place');
  expect(document.getElementById('ff-district')).toHaveValue('Kusini');
});
