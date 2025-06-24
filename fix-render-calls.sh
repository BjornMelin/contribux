#!/bin/bash

# Fix all render calls to use renderIsolated
sed -i 's/render(<SearchBar/const { getByRole, getByText, getByPlaceholderText, getByDisplayValue, container } = renderIsolated(<SearchBar/g' tests/components/search-components.test.tsx
sed -i 's/render(<SearchFiltersComponent/const { getByRole, getByText, getByPlaceholderText, getAllByRole, container } = renderIsolated(<SearchFiltersComponent/g' tests/components/search-components.test.tsx
sed -i 's/render(<OpportunityCard/const { getByRole, getByText, container } = renderIsolated(<OpportunityCard/g' tests/components/search-components.test.tsx
sed -i 's/render(<OpportunityList/const { getByRole, getByText, getAllByRole, container } = renderIsolated(<OpportunityList/g' tests/components/search-components.test.tsx

# Replace screen. with local queries
sed -i 's/screen\.getByRole/getByRole/g' tests/components/search-components.test.tsx
sed -i 's/screen\.getByText/getByText/g' tests/components/search-components.test.tsx
sed -i 's/screen\.getByPlaceholderText/getByPlaceholderText/g' tests/components/search-components.test.tsx
sed -i 's/screen\.getByDisplayValue/getByDisplayValue/g' tests/components/search-components.test.tsx
sed -i 's/screen\.getAllByRole/getAllByRole/g' tests/components/search-components.test.tsx
sed -i 's/screen\.queryByText/queryByText/g' tests/components/search-components.test.tsx
sed -i 's/screen\.queryByRole/queryByRole/g' tests/components/search-components.test.tsx