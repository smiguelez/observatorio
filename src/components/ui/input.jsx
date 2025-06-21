export function Input({ ...props }) {
  return (
    <input
      className="border border-gray-300 p-2 rounded w-full focus:outline-none focus:ring focus:border-blue-300"
      {...props}
    />
  );
}
