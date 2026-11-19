import { toast } from "sonner";
import { AvisoRuido, type PropsAvisoRuido } from "./AvisoRuido";

/** Enseña el aviso unos segundos (no se cierra mientras el ratón está encima); «Deshacer» también lo cierra. */
export function avisarRuido(props: PropsAvisoRuido) {
  return toast.custom(
    (id) => (
      <AvisoRuido
        {...props}
        onDeshacer={() => {
          toast.dismiss(id);
          props.onDeshacer();
        }}
      />
    ),
    { duration: 8000 },
  );
}
