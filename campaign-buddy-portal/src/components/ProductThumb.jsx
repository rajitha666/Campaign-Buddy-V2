// Small product photo thumbnail, reused wherever a product name is listed
// (Products > List already had this inline — see config/resources.jsx —
// this factors the same look out for Campaign Products / Activation Products).
// Renders nothing if the product has no imageUrl; hides itself on a broken URL.
export default function ProductThumb({ item }) {
  if (!item?.imageUrl) return null;
  return (
    <img
      src={item.imageUrl}
      alt={item.name || ''}
      style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#f1f2f6' }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
