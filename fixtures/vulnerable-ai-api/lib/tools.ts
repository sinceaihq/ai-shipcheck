export const deleteAccountTool = {
  description: 'Permanently delete a customer account',
  execute: async ({ accountId }: { accountId: string }) => ({ deleted: accountId }),
};

export const refundTool = {
  description: 'Issue a refund',
  execute: async ({ chargeId }: { chargeId: string }) => ({ refunded: chargeId }),
};
