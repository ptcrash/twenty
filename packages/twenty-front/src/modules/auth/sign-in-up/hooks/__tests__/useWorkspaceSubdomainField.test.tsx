import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { useWorkspaceSubdomainField } from '@/auth/sign-in-up/hooks/useWorkspaceSubdomainField';
import { CheckWorkspaceSubdomainAvailabilityDocument } from '~/generated-metadata/graphql';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

dynamicActivate(SOURCE_LOCALE);

const availabilityMock = (
  subdomain: string,
  result: { isValid: boolean; available: boolean; suggestedSubdomain: string },
) => ({
  request: {
    query: CheckWorkspaceSubdomainAvailabilityDocument,
    variables: { subdomain },
  },
  result: {
    data: {
      checkWorkspaceSubdomainAvailability: {
        __typename: 'SubdomainAvailabilityDTO',
        ...result,
      },
    },
  },
});

const createWrapper =
  (mocks: ReturnType<typeof availabilityMock>[]) =>
  ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </MockedProvider>
  );

describe('useWorkspaceSubdomainField', () => {
  it('auto-fills an available subdomain derived from the workspace name', async () => {
    const { result, rerender } = renderHook(
      ({ workspaceName }: { workspaceName: string }) =>
        useWorkspaceSubdomainField({ workspaceName }),
      {
        initialProps: { workspaceName: '' },
        wrapper: createWrapper([
          availabilityMock('apple', {
            isValid: true,
            available: true,
            suggestedSubdomain: 'apple',
          }),
        ]),
      },
    );

    rerender({ workspaceName: 'Apple' });

    await waitFor(() => expect(result.current.subdomain).toBe('apple'), {
      timeout: 3000,
    });
    expect(result.current.status).toBe('available');
    expect(result.current.isAvailable).toBe(true);
  });

  it('reports an unavailable manual subdomain and offers a suggestion', async () => {
    const { result } = renderHook(
      () => useWorkspaceSubdomainField({ workspaceName: '' }),
      {
        wrapper: createWrapper([
          availabilityMock('taken', {
            isValid: true,
            available: false,
            suggestedSubdomain: 'taken-2',
          }),
        ]),
      },
    );

    act(() => {
      result.current.handleSubdomainChange('taken');
    });

    await waitFor(() => expect(result.current.status).toBe('unavailable'), {
      timeout: 3000,
    });
    expect(result.current.suggestion).toBe('taken-2');
    expect(result.current.isAvailable).toBe(false);
  });

  it('re-validates an applied suggestion before enabling submission', async () => {
    const { result } = renderHook(
      () => useWorkspaceSubdomainField({ workspaceName: '' }),
      {
        wrapper: createWrapper([
          availabilityMock('taken', {
            isValid: true,
            available: false,
            suggestedSubdomain: 'taken-2',
          }),
          availabilityMock('taken-2', {
            isValid: true,
            available: true,
            suggestedSubdomain: 'taken-2',
          }),
        ]),
      },
    );

    act(() => {
      result.current.handleSubdomainChange('taken');
    });

    await waitFor(() => expect(result.current.suggestion).toBe('taken-2'), {
      timeout: 3000,
    });

    act(() => {
      result.current.applySuggestion();
    });

    // Continue stays disabled until the suggestion is re-confirmed available.
    expect(result.current.isAvailable).toBe(false);

    await waitFor(() => expect(result.current.status).toBe('available'), {
      timeout: 3000,
    });
    expect(result.current.subdomain).toBe('taken-2');
  });
});
