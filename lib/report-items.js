(function exposeReportItemHelpers(root) {
  function parseLocalizedNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value == null || value === '') return null;
    let text = String(value).trim();
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    const number = Number(text.replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }

  function formatQuantity(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
  }

  function formatAmount(value, maximumFractionDigits = 2) {
    return `R$ ${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(value)}`;
  }

  function combineDuplicateItems(items) {
    const combined = new Map();
    for (const item of items) {
      const key = [
        String(item.code).trim().toLocaleUpperCase('pt-BR'),
        String(item.deposit).trim(),
      ].join('\u0000');
      const quantity = parseLocalizedNumber(item.quantity);
      const total = parseLocalizedNumber(item.total);
      const current = combined.get(key);
      if (!current) {
        combined.set(key, {
          ...item,
          _quantity: quantity,
          _total: total,
          _canAggregate: quantity != null && total != null,
        });
        continue;
      }

      if (!current._canAggregate || quantity == null || total == null) {
        const uniqueKey = `${key}\u0000${combined.size}`;
        combined.set(uniqueKey, { ...item });
        continue;
      }

      current._quantity += quantity;
      current._total += total;
      current.quantity = formatQuantity(current._quantity);
      current.total = formatAmount(current._total);
      current.cost = current._quantity === 0
        ? current.cost
        : formatAmount(current._total / current._quantity, 4);
    }

    return [...combined.values()].map(({ _quantity, _total, _canAggregate, ...item }) => {
      const cost = parseLocalizedNumber(item.cost);
      const total = parseLocalizedNumber(item.total);
      return {
        ...item,
        cost: cost == null ? item.cost : formatAmount(cost, 4),
        total: total == null ? item.total : formatAmount(total),
      };
    });
  }

  root.combineDuplicateReportItems = combineDuplicateItems;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { combineDuplicateItems };
  }
})(globalThis);
