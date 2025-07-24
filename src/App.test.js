import { render, screen } from '@testing-library/react'; // Importing testing utilities
import App from './App'; // Importing the component to test

test('renders learn react link', () => {
  render(<App />); // Render the App component
  const linkElement = screen.getByText(/learn react/i); // Search for text matching "learn react"
  expect(linkElement).toBeInTheDocument(); // Assert that the element is present in the document
});
