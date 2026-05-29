// The duplication is coming from lines 98-99, 123, 136-137.
// Line 98: .mockResolvedValueOnce(redirect as never)
// Line 99: .mockResolvedValueOnce(final as never);

// Line 136: .mockResolvedValueOnce(redirect as never)
// Line 137: .mockResolvedValueOnce(final as never);

// And lines 112-113:
// const firstCallInit = vi.mocked(undiciFetch).mock.calls[0][1];
// expect(firstCallInit?.method).toBe("POST");

// Lines 146-147:
// const firstCallInit = vi.mocked(undiciFetch).mock.calls[0][1];
// expect(firstCallInit?.method).toBe("POST");
