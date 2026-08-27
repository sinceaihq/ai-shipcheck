const API_KEY = 'sk-ant-SHIPCHECKFIXTUREKEY000000000000';

export const stripeSecret = 'sk_test_SHIPCHECKFIXTURE000000000000';

export function authorisationHeader() {
  return { Authorization: `Bearer ${API_KEY}` };
}
