export function Label({ className="", children, ...props }) {
  return <label className={`block mb-1 ${className}`} {...props}>{children}</label>;
}