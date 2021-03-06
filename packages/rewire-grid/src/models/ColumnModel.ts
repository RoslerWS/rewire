import * as React from 'react';
import {
  IColumn,
  ICell,
  IColumnOptions,
  EditorType,
  IColumnEditor,
  SortDirection,
  IGrid,
  TextAlignment,
  VerticalAlignment
} from './GridTypes';
import {
  editor,
  compare,
  defaultPhoneFormat,
  defaultPhoneMask,
  IValidator,
  validators,
} from 'rewire-ui';
import {isNullOrUndefined, UTC} from 'rewire-common';
import {
  freeze,
  createWatcherFn,
  WatcherTypeFn,
  observable,
} from 'rewire-core';
import * as is             from 'is';

let id            = 0;
const toLowerCase = (value: string) => String(value).toLowerCase();

export class ColumnModel implements IColumn {
  _enabled?            : boolean;
  _readOnly?           : boolean;
  _verticalAlign?      : VerticalAlignment;
  __validators         : IValidator[];
  __watchColumnVisible : WatcherTypeFn;
  __watchColumnFixed   : WatcherTypeFn;

  id           : number;
  grid         : IGrid;
  name         : string;
  title        : string;
  editable     : boolean;
  fixed        : boolean;
  width?       : string;
  visible      : boolean;
  align?       : TextAlignment;
  colSpan      : number;
  rowSpan      : number;
  position     : number;
  sort?        : SortDirection;
  canSort      : boolean;
  tooltip?     : string;
  cls?         : any;
  typeOptions? : any;
  type         : EditorType;
  renderer?    : React.SFC<any>;
  editor?      : React.SFC<any>;

  onValueChange?(cell: ICell, v: any): void;
  map?(value: any): string;
  predicate?(value: any, filter: {value: any}): boolean;
  compare?(x: any, y: any): number;

  static positionCompare(a: IColumn, b: IColumn): number {
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
  }

  private constructor() { }

  private initialize(name: string, title: string, options?: IColumnOptions) {
    this.id             = id++;
    this.name           = name;
    this.title          = title;
    this.position       = 0;
    this.sort           = undefined;
    this.typeOptions    = undefined;
    this._enabled       = options && !isNullOrUndefined(options.enabled) ? options.enabled! : undefined;
    this._readOnly      = options && !isNullOrUndefined(options.readOnly) ? options.readOnly! : undefined;
    this._verticalAlign = options && !isNullOrUndefined(options.verticalAlign) ? options.verticalAlign! : undefined;
    this.editable       = options && !isNullOrUndefined(options.editable) ? options.editable! : true;
    this.fixed          = options && !isNullOrUndefined(options.fixed) ? options.fixed! : false;
    this.width          = options && !isNullOrUndefined(options.width) ? options.width! : undefined;
    this.visible        = options && !isNullOrUndefined(options.visible) ? options.visible! : true;
    this.align          = options && !isNullOrUndefined(options.align) ? options.align! : undefined;
    this.colSpan        = options && !isNullOrUndefined(options.colSpan) ? options.colSpan! : 1;
    this.rowSpan        = options && !isNullOrUndefined(options.rowSpan) ? options.rowSpan! : 1;
    this.canSort        = options && !isNullOrUndefined(options.canSort) ? options.canSort! : true;
    this.tooltip        = options && !isNullOrUndefined(options.tooltip) ? options.tooltip! : undefined;
    this.cls            = options && !isNullOrUndefined(options.cls) ? options.cls! : undefined;
    this.renderer       = options && !isNullOrUndefined(options.renderer) ? options.renderer! : undefined;
    this.onValueChange  = options && !isNullOrUndefined(options.onValueChange) ? options.onValueChange! : undefined;
    this.compare        = options && !isNullOrUndefined(options.compare) ? options.compare! : undefined;
    if (options && options.validators) {
      this.__validators = validators(options.validators);
    }
    this.setEditor(options && options.type);

    this.__watchColumnVisible = createWatcherFn();
    this.__watchColumnFixed   = createWatcherFn();

    return this;
  }

  set readOnly(value: boolean) {
    this._readOnly = value;
  }
  get readOnly(): boolean {
    return (!isNullOrUndefined(this._readOnly) ? this._readOnly : this.grid.readOnly) as boolean;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }
  get enabled(): boolean {
    return (!isNullOrUndefined(this._enabled) ? this._enabled : this.grid.enabled) as boolean;
  }

  set verticalAlign(value: VerticalAlignment) {
    this._verticalAlign = value;
  }
  get verticalAlign(): VerticalAlignment {
    return this._verticalAlign || this.grid.verticalAlign;
  }

  get isGroupByColumn(): boolean {
    return this.grid.groupBy.findIndex((column: IColumn) => column.id === this.id) >= 0;
  }

  setEditor(type?: IColumnEditor) {
    let typeOptions: any;
    let t: EditorType;
    if (!type) {
      t = 'text';
    } else if (typeof (type) === 'string') {
      t = type;
    } else {
      t           = type.type;
      typeOptions = type.options;
    }

    this.type        = t;
    this.typeOptions = typeOptions || {};
    freeze(() => {
      if (this.type === 'none') {
        this.editor = undefined;
      } else {
        this.editor = editor(t, this.typeOptions);
      }

      this.editable  = !!this.editor;
      this.map       = undefined;
      this.predicate = undefined;
      this.compare   = this.typeOptions.compare;

      if (t === 'number') {
        this.map   = getNumberString;
        this.align = this.align || 'right';
      } else if (t === 'checked') {
        this.map = (value: boolean) => value ? 'True' : 'False';
      } else if (t === 'date') {
         this.map = (value: UTC) => value ? value.toDateString() : '';
      } else if (t === 'phone') {
        if (!this.typeOptions.format) {
          this.typeOptions.format = defaultPhoneFormat;
        }
        if (!this.typeOptions.mask) {
          this.typeOptions.mask = defaultPhoneMask;
        }
        this.map = getPhoneString;
      } else if (t === 'multiselect' || t === 'multiselectautocomplete') {
        this.map       = getArrayString(this.typeOptions.map);
        this.predicate = (value: any, filter: any) => toLowerCase(this.map!(value)).includes(toLowerCase(filter.value));
        this.compare   = arrayCompare(this.typeOptions);
      }

      if (this.typeOptions.map && t !== 'multiselect' && t !== 'multiselectautocomplete') {
        this.map       = (value: any) => this.typeOptions.map(value);
        this.predicate = (value: any, filter: any) => toLowerCase(this.typeOptions.map(value)).includes(toLowerCase(filter.value));
        if (this.compare) {
          this.compare = (x: any, y: any) => this.compare!(this.typeOptions.map(x), this.typeOptions.map(y));
        } else {
          this.compare = (x: any, y: any) => compare(this.typeOptions.map(x), this.typeOptions.map(y));
        }
      }
    });
  }

  static create(name: string, title: string, options?: IColumnOptions): IColumn {
    return observable(new ColumnModel()).initialize(name, title, options);
  }
}

const getArrayString = (map?: (v: any) => string) => (value: any): string => {
  if (!value) return '';

  let values = map ? value.map((v: any) => map(v)) : value;
  return values.join(', ');
};

const arrayCompare = (options?: any) => (x: any, y: any): number => {
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;

  for (let i = 0; i < x.length && i < y.length; i++) {
    let xVal = options && options.map ? options.map(x[i]) : x[i];
    let yVal = options && options.map ? options.map(y[i]) : y[i];
    let c    = options && options.compare ? options.compare(xVal, yVal) : compare(xVal, yVal);
    if (c !== 0) {
      return c;
    }
  }

  return (x.length < y.length ? -1 : x.length > y.length ? 1 : 0);
};

function getNumberString(value: any): string {
  if (isNullOrUndefined(value)) return value;

  let numberStr = this.typeOptions && this.typeOptions.decimals && is.number(value) ? value.toFixed(this.typeOptions.decimals) : value.toString();
  if (this.typeOptions && !this.typeOptions.fixed) {
    numberStr = parseFloat(numberStr).toString();
  }
  numberStr = this.typeOptions && this.typeOptions.thousandSeparator ? getThousandSeparatedNumberString(numberStr) : numberStr;

  return numberStr;
}

function splitDecimal(numStr: string): any {
  const hasNagation = numStr[0] === '-';
  const addNegation = hasNagation;
  numStr            = numStr.replace('-', '');

  const parts         = numStr.split('.');
  const beforeDecimal = parts[0];
  const afterDecimal  = parts[1] || '';

  return {
    beforeDecimal,
    afterDecimal,
    addNegation,
  };
}

function getThousandSeparatedNumberString(numStr: string): string {
  let {beforeDecimal, afterDecimal, addNegation} = splitDecimal(numStr);
  let hasDecimalSeparator = !!afterDecimal && afterDecimal.length > 0;

  beforeDecimal = beforeDecimal.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + ',');

  if (addNegation) beforeDecimal = '-' + beforeDecimal;

  return beforeDecimal + (hasDecimalSeparator ? '.' : '') + afterDecimal;
}

function getPhoneString(value: any): string {
  if (isNullOrUndefined(value)) return value;

  let phoneStr             = value.toString();
  let phoneFormat          = this.typeOptions.format;
  let phoneMask            = this.typeOptions.mask;
  let hashCount            = 0;
  const formattedNumberArr = phoneFormat.split('');
  for (let i = 0; i < phoneFormat.length; i++) {
    if (phoneFormat[i] === '#') {
      formattedNumberArr[i] = phoneStr[hashCount] || phoneMask;
      hashCount++;
    }
  }
  return formattedNumberArr.join('');
}

export default ColumnModel.create;