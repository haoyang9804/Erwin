var A = /** @class */ (function () {
    function A(x, y) {
    }
    return A;
}());
// type B = new (x: number, ...rest: any[]) => A
// let b: B = new A(1, '3')
var a = A;
var aa = new a(1, '3');
console.log('>>>', typeof aa);
